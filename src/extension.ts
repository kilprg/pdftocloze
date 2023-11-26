import * as vscode from 'vscode'
import * as util from 'util'
import * as path from 'path'
import { exec as exec_ } from 'child_process'
import { Level, Regex, Config, Message, ROMAN_MAP } from './constants'

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

let panel: vscode.WebviewPanel
let context: vscode.ExtensionContext

export function activate(ctx: vscode.ExtensionContext) {
	context = ctx
	let disposable = vscode.commands.registerCommand('extension.pdftocloze.load', load)
	context.subscriptions.push(disposable)
	disposable = vscode.commands.registerCommand('extension.pdftocloze.open', open)
	context.subscriptions.push(disposable)
}

async function open() {
	if (panel)
		panel.reveal(vscode.ViewColumn.Two)
	else {
		panel = vscode.window.createWebviewPanel('htmlPreview', 'PDF to Anki cloze', vscode.ViewColumn.Two, { enableScripts: true })
		panel.webview.html = load_panel()
		panel.webview.onDidReceiveMessage(listener, undefined, context.subscriptions)
	}
}

/** Select, convert and load PDF, loading configuration and setting up interface as needed */
async function load() {
	const opts: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Open',
		filters: {
			'PDF files': ['pdf']
		}
	}
	const cfg = context.globalState.get(KEY) as Config
	if (cfg && cfg.uri) opts.defaultUri = cfg.uri
	const uri = await vscode.window.showOpenDialog(opts)
	if (!uri) return
	cfg.uri = uri[0]
	context.globalState.update(KEY, cfg)
	const file = uri[0].fsPath

	const txt = await convert(file)
	if (!txt) return
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: txt })
	await vscode.window.showTextDocument(document, vscode.ViewColumn.One)
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
	//vscode.window.showInformationMessage(`${msg.command}: ${msg.params?.join(', ')}`)
	switch (msg.command) {
		case 'document.re':
			re('document', msg.params![0], controls(msg.params![1]))
			break
		case 'item.re':
			re('item', msg.params![0], controls(msg.params![1]))
			break
		case 'question.re':
			re('question', msg.params![0], controls(msg.params![1]))
			break
		case 'answer.re':
			re('answer', msg.params![0], controls(msg.params![1]))
			break
		case 'text.re':
			re('text', msg.params![0], controls(msg.params![1]))
			break
		case 'options.re':
			re('options', msg.params![0], controls(msg.params![1]))
			break
		case 'document.join':
			join('document')
			break
		case 'item.join':
			join('item')
			break
		case 'question.join':
			join('question')
			break
		case 'answer.join':
			join('answer')
			break
		case 'text.join':
			join('text')
			break
		case 'options.join':
			join('options')
			break
		case 'options.lists':
			lists('options')
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
function sreplace(str: string, regex: string, replacement: string): string {
	const match = regex.match(/^\/(.*)\/([gimuy]*)$/)
	if (match) {
		try {
			const re = new RegExp(match[1], match[2])
			return str.replace(new RegExp(match[1], match[2]), replacement)
		} catch (e: any) {
			vscode.window.showErrorMessage(e.message)
			return str
		}	
	} else {
		return str.replace(regex, replacement)
	}
}

interface Item {
	item: string
	question: string
	text?: string
	options?: string
	answer?: string
}

/** Splits string into Item[] */
function split_doc(str: string): Item[] {
	const items: Item[] = []
	for (const item of str.split(/(?<=\S)\s*^[ \t]*[*]{3,}[ \t]*$\s*/gm)) {
		const itm: Item = {item: item, question: item}
		const m = itm.item.match(/\s*^[ \t]*[=]{3,}[ \t]*$\s*/m)
		if (m) {
			itm.question = itm.item.slice(0, m.index)
			itm.answer = itm.item.slice(m.index! + m[0].length)
			const mm = itm.question.match(/\s*^[ \t]*[-]{3,}[ \t]*$\s*/m)
			if (mm) {
				itm.text = itm.question.slice(0, mm.index)
				itm.options = itm.question.slice(mm.index! + mm[0].length)
			}
		} else {
			const mm = itm.question.match(/\s*^[ \t]*[-]{3,}[ \t]*$\s*/m)
			if (mm) {
				itm.text = itm.question.slice(0, mm.index)
				itm.options = itm.question.slice(mm.index! + mm[0].length)
			}
		}
		items.push(itm)
	}
	return items
}

/** Replace specified level with callback return */
function lreplace(level: Level, replacer: (str: string) => string) {
	const editor = vscode.window.visibleTextEditors[0]
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		editor.edit(build => {
			if (level === 'document') {
				build.replace(rng, replacer(txt))
			} else {
				const items = split_doc(txt)
				if (level === 'item') {
					for (const item of items)
						item.item = replacer(item.item)
				} else if (level === 'question') {
					for (const item of items) {
						if (!(item.text || item.options)) {
							item.item = replacer(item.question)
							if (item.answer)
								item.item += `\n\n${ANSWER_SEP}\n\n${item.answer}`	
						}
					}
				} else if (level === 'answer') {
					for (const item of items) {
						if (item.answer) {
							item.answer = replacer(item.answer)
							item.item = `${item.question}\n\n${ANSWER_SEP}\n\n${item.answer}`
						}
					}
				} else if (level === 'text') {
					for (const item of items) {
						if (item.text) {
							item.text = replacer(item.text)
							item.item = item.text
							if (item.options)
								item.item += `\n\n${OPTIONS_SEP}\n\n${item.options}`
							if (item.answer)
								item.item += `\n\n${ANSWER_SEP}\n\n${item.answer}`
						}
					}
				} else if (level === 'options') {
					for (const item of items) {
						if (item.options) {
							item.options = replacer(item.options)
							item.item = item.text
								? `${item.text}\n\n${OPTIONS_SEP}\n\n`
								: ''
							item.item += item.options
							if (item.answer)
								item.item += `\n\n${ANSWER_SEP}\n\n${item.answer}`
						}
					}
				}
				build.replace(
					rng,
					items.map(item => item.item).join(`\n\n${ITEM_SEP}\n\n`)
				)
			}
		})
	}
}

function join(level: Level): void {
	lreplace(level, replacer)

	function replacer(txt: string): string {
		let result = ''
		const lines = txt.split(/[ \t]*\n[ \t]*/)
		for (let i = 0; i < lines.length - 1; i++) {
			const n = lines[i].lastIndexOf(' ')
			result += `${lines[i]}${n > 60 ? ' ' : '\n'}`
		}
		result += lines[lines.length - 1]
		result = result.replace(/\n{3,}/g, '\n\n')
		return result
	}
}

/** Run replacement on entire or part of document */
function re(level: Level, regex: string, repl: string): void {
	lreplace(level, replacer)
	function replacer(txt: string): string {
		return sreplace(txt, regex, repl)
	}
}

/** Try to find any lists at the given level */
function lists(level: Level): void {
	lreplace(level, replacer)
	function replacer(txt: string): string {
		let items = txt.split(/[ \t]*\n[ \t]*(?=(?:[a-m]|[0-9]+|(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))[.): \t][ \t]*)/gmi)
		if (items.length < 2) return txt
		if (items[0][0].toLocaleLowerCase() === 'a') {
			const a = 'a'.charCodeAt(0)
			for (let i = 1; i < items.length; i++) {
				if (items[i][0].toLocaleLowerCase() !== String.fromCharCode(a + i))
					return txt
			}
			return list(items, 'letter')
		} else if (items[0][0] === '1') {
			for (let i = 0; i < items.length; i++) {
				const match = items[i].match(/^\d+/)
				if (!match || match[0] !== (i + 1).toString())
					return txt
			}
			return list(items, 'number')
		} else if (items[0][0].toLowerCase() === 'i') {
			for (let i = 0; i < items.length; i++) {
				const match = items[i].match(/^(.*?)[.): \t]/)
				if (!match || match[1].toUpperCase() !== roman(i + 1))
					return txt
			}
			return list(items, 'roman')
		}

		return txt

		function list(items: string[], type: 'number'|'letter'|'roman'): string {
			for (let i = 0; i < items.length; i++) {
				if (type === 'number')
					items[i] = items[i].replace(/([ \t]*\n[ \t]*)+/gm, ' ').trim()
				else
					items[i] = '- ' + items[i].replace(/([ \t]*\n[ \t]*)+/gm, ' ').trim()

			}
			return items.join('\n')
		}

		function roman(n: number): string {
			let rn = ''
			for (const [value, symbol] of ROMAN_MAP) {
				while (n >= value) {
					rn += symbol
					n -= value
				}
			}
		
			return rn
		}

	}
}

/** Load configuration (regexes etc) from persistent storage and set up panel HTML */
function load_panel(): string {
	const cfg = context.globalState.get(KEY) as Config || { document: [], item: [], question: [], text: [], options: [], answer: [] }
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
					<button onclick="lists(this, vscode)">Parse lists</button>
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

	return html

	function level(section: Level, items: Regex[]): string {
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
			<button onclick="join_lines(this, vscode)">Join lines</button>
			<button onclick="add_row(this)">Add row</button>`
		return result
	}
}

/** Persist config */
function save(data: Config): void {
	context.globalState.update(KEY, data)
}

/** Cloze the supplied string to Anki HTML. */
function cloze(): void {
	const editor = vscode.window.visibleTextEditors[0]
	const doc = editor?.document
	if (doc) {
		const txt = doc.getText()
		const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(txt.length))
		const items = split_doc(txt)
		editor.edit(build => {
			for (let i = 0; i < items.length; i++) {
				items[i].item = ''
				if (items[i].text || items[i].options) {
					if (items[i].text)
						items[i].item += `${hardbreak(items[i].text!)}\n\n`
					if (items[i].options)
						items[i].item += `${hardbreak(items[i]!.options!)}\n\n`
				} else {
					items[i].item = `${hardbreak(items[i].question)}\n\n`
				}

				items[i].item += `{{c${i}::`
				if (items[i].answer) {
					items[i].item += `  \n${hardbreak(items[i].answer!)}  \n`
				} else {
					if (items[i].options) {
						items[i].item += `  \n${hardbreak(items[i].options!)}  \n`
					} else {
						items[i].item += '\n\n'
					}
				}
				items[i].item += '}}'
			}
			build.replace(
				rng,
				items.map(item => item.item.trim())
				.join(`\n\n${ITEM_SEP}\n\n`)
			)
		})
	}
}

function hardbreak(str: string): string {
	return str.trim().replace(/[ \t]*\n(?![ \t]*\n)/, '  \n')
}

/** Called when extension is deactivated */
export function deactivate() {
	panel?.dispose()
	panel = undefined!
}
