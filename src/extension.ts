import * as vscode from 'vscode'
import * as util from 'util'
import * as path from 'path'
import { exec as exec_ } from 'child_process'
import { Level, Regex, Config, Message } from './constants'

/**
 * REMAINS
 * - Create panel HTML
 *   - Regexes at document level
 *   - Split to question
 *   - Regexes at question level
 *   - Split question to q/a
 *   - Regexes at q level
 *   - Split q to text and options
 *   - Regexes at text level
 *   - Regexes at option level
 *   - Regexes at a level
 *   - Convert to HTML
 *   - Make as ul and then save arrays of regexes and titles w/ add/delete buttons
 * - Implement load/save
 */

const exec = util.promisify(exec_)
const KEY = 'pdftotext'
const ITEM_SEP = '*************************************************'
const ANSWER_SEP = '================================================='
const OPTIONS_SEP = '-------------------------------------------------'

let editor: vscode.TextEditor
let panel: vscode.WebviewPanel
let context: vscode.ExtensionContext

export function activate(ctx: vscode.ExtensionContext) {
	context = ctx
	let disposable = vscode.commands.registerCommand('extension.pdftocloze', load)
	context.subscriptions.push(disposable)
}

/** Select, convert and load PDF, loading configuration and setting up interface as needed */
async function load() {
	const file = (await vscode.window.showOpenDialog({
		canSelectMany: false,
		openLabel: 'Open',
		filters: {
			'PDF files': ['pdf']
		}
	}))?.[0].fsPath
	if (!file) return

	const txt = await convert(file)
	if (!txt) return
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: txt })
	editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One)
	if (panel)
		panel.reveal(vscode.ViewColumn.Two)
	else {
		panel = vscode.window.createWebviewPanel('htmlPreview', 'PDF to Anki cloze', vscode.ViewColumn.Two, { enableScripts: true })
		panel.webview.html = load_panel()
		panel.webview.onDidReceiveMessage(listener, undefined, context.subscriptions)
	}
}

/** Async convert supplied file to text and return string or undefined. */
async function convert(file: string): Promise<string | undefined> {
	let e
	try {
		const command = `pdftotext -layout -nodiag -eol unix -nopgbrk "${file}" -`
		const { stderr, stdout } = await exec(command)
		if (stdout && !stderr) return stdout
		e = stderr
	} catch (error) {
		e = error
	}
	vscode.window.showErrorMessage(`Failed to convert PDF: ${e}`)
	return undefined
}

/** Listens for postMessage from the WebView panel and executes the appropriate command. */
function listener(msg: Message): void {
	vscode.window.showInformationMessage(`${msg.command}: ${msg.params?.join(', ')}`)
	switch (msg.command) {
		case 'document.re':
			document_re(controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'item.re':
			item_re(controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'question.re':
			qa_re('question', controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'answer.re':
			qa_re('answer', controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'text.re':
			text_options_re('text', controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'options.re':
			text_options_re('options', controls(msg.params![0]), controls(msg.params![1]))
			break
		case 'save':
			save(msg.params![0] as Config)
			break
		case 'cloze':
			cloze()
			break
		}
}


/** Fix control chars */
function controls(str: string): string {
    return str
        .replace(/\\n/g, '\n') // Newline
        .replace(/\\t/g, '\t') // Tab
        .replace(/\\r/g, '\r') // Carriage return
        .replace(/\\b/g, '\b') // Backspace
        .replace(/\\f/g, '\f') // Form feed
        .replace(/\\v/g, '\v') // Vertical tab
        .replace(/\\\\/g, '\\'); // Backslash
}

/** Replace in supplied string, tries to interpret as regex (`/some [tT]hing/g`), otherwise replaces as a string */
function replace(str: string, regex: string, replacement: string): string {
	const match = regex.match(/\/(.*)\/([gimuy]*)/)
	return match
		? str.replace(new RegExp(match[1], match[2]), replacement)
		: str.replace(regex, replacement)
}

/** Split supplied text into items (***) */
function split_items(str: string): string[] {
	return str.split(/\s*^[ \t]*[*]{3,}[ \t]*$\s*/gm)
}

/** Split supplied text into question and answer (===) */
function split_question(str: string): string[] {
	const match = str.match(/\s*^[ \t]*[=]{3,}[ \t]*$\s*/m)
	if (match)
		return [str.slice(0, match.index), str.slice(match.index! + match[0].length)]
	return [str]
}

/** Split supplied text into question text and options (---) */
function split_text_options(str: string): string[] {
	const match = str.match(/\s*^[ \t]*[-]{3,}[ \t]*$\s*/m)
	if (match)
		return [str.slice(0, match.index), str.slice(match.index! + match[0].length)]
	return [str]
	return str.split(/\s*^[ \t]*[-]{3,}[ \t]*$\s*/gm)
}


/** Run replacement on entire document */
function document_re(regex: string, repl: string): void {
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			build.replace(rng, replace(txt, regex, repl))
		})
	}
}

function item_re(regex: string, repl: string): void {
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			build.replace(
				rng,
				split_items(txt)
					.map(txt => replace(txt, regex, repl))
					.join(`\n\n${ITEM_SEP}\n\n`)
			)
		})
	}
}

/** Run regex on question or answer part */
function qa_re(part: 'question'|'answer', regex: string, repl: string): void {
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			build.replace(
				rng,
				split_items(txt)
				.map(item => {
					const qa = split_question(item)
					if (qa.length > 1) { // only on items with q & a
						return (
							part === 'question'
								? [replace(qa[0], regex, repl), qa[1]]
								: [qa[0], replace(qa[1], regex, repl)]
						)
						.join(`\n\n${ANSWER_SEP}\n\n`)
					}
					return item
				})
				.join(`\n\n${ITEM_SEP}\n\n`)
			)
		})
	}
}

/** Run regex on question text or options part */
function text_options_re(part: 'text'|'options', regex: string, repl: string): void {
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			build.replace(
				rng,
				split_items(txt)
				.map(item => {
					const qa = split_question(item)
					const to = split_text_options(qa[0])
					if (to.length > 1) { // only on questions with t & o
						return [
							(
								part === 'text'
									? [replace(to[0], regex, repl), to[1]]
									: [to[0], replace(to[1], regex, repl)]
							).join(`\n\n${OPTIONS_SEP}\n\n`),
							qa[1] || ''
						].join(`\n\n${ANSWER_SEP}\n\n`)
					}
					return item
				})
				.join(`\n\n${ITEM_SEP}\n\n`)
			)
		})
	}
}

/** Load configuration (regexes etc) from persistent storage and set up panel HTML */
function load_panel(): string {
	const cfg = context.globalState.get(KEY) as Config || { document: [], item: [], question: [], text: [], options: [], answer: [] }
	//const cfg = { document: [], item: [], question: [], text: [], options: [], answer: [] }
	vscode.window.showInformationMessage('>>>>' + JSON.stringify(cfg))
	const uri = panel.webview.asWebviewUri(
		vscode.Uri.joinPath(context.extensionUri, 'out', 'webview.js')
	)

	const html = `
			<html>
			<head>
			<script>const vscode = acquireVsCodeApi()</script>
			<script src="${uri}"></script>
			</head>
			<body>
				<div id="input">
					<hr style="margin-top: 20px;">
					<b>DOCUMENT</b>
					${level('document', cfg.document)}
					<hr style="margin-top: 30px;">
					<b>ITEM</b>
					${level('item', cfg.item)}
					<hr style="margin-top: 30px;">
					<b>QUESTION</b>
					${level('question', cfg.question)}
					<hr style="margin-top: 30px;">
					<b>TEXT</b>
					${level('text', cfg.text)}
					<hr style="margin-top: 30px;">
					<b>OPTIONS</b>
					${level('options', cfg.options)}
					<hr style="margin-top: 30px;">
					<b>ANSWER</b>
					${level('answer', cfg.answer)}
					<hr style="margin-top: 30px;">
					<button onclick="save(vscode)">Save</button>
					<button onclick="vscode.postMessage({command: 'cloze'})">Cloze</button>
				</div>
			</body>
			</html>
	`

	vscode.window.showInformationMessage(html)
	return html

	function level(section: Level, items: Regex[]): string {
		vscode.window.showInformationMessage('>>' + JSON.stringify(items))
		let result = `<table id="${section}">`
		for (const { title, regex, replacement } of items) {
			result += `
				<tr>
					<td style="width: 1px; white-space: nowrap;">${title}</td>
					<td style="display: flex;">
						<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;" value="${regex}">
						<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;" value="${replacement}">
						<button onclick="post_re(this, vscode)">Apply</button>
						<button onclick="del_row(this)">Delete</button>
					</td>
				</tr>
				`
		}
		result += `</table>
			<button onclick="add_row(this)">Add row</button>`
		return result
	}
}

/** Persist config */
function save(data: Config): void {
	vscode.window.showInformationMessage('saving: ' + JSON.stringify(data))
	context.globalState.update(KEY, data)
}

/** Cloze the supplied string to Anki HTML. */
function cloze(): void {
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			for (const item of split_items(txt)) {
				const qa = split_question(item)
				const to = split_text_options(qa[0])
				if (to.length > 1) {
					//

				} else {

				}
			}
			build.replace(
				rng,
				split_items(txt)
				.map(item => {
					const qa = split_question(item)
					if (qa.length > 1) { // only on items with q & a
						const to = split_text_options(qa[0])
						if (to.length > 1) { // only on questions with t & o
							return [
								(
									part === 'text'
										? [replace(to[0], regex, repl), to[1]]
										: [to[0], replace(to[1], regex, repl)]
								).join(`\n\n${OPTIONS_SEP}\n\n`),
								qa[1]
							].join(`\n\n${ANSWER_SEP}\n\n`)
						}
					}
					return item
				})
				.join(`\n\n${ITEM_SEP}\n\n`)
			)
		})
	}
}

/** Called when extension is deactivated */
export function deactivate() {
	panel?.dispose()
	panel = undefined!
}
