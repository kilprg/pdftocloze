import * as vscode from 'vscode'
import * as util from 'util'
import { exec as exec_ } from 'child_process'

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

declare type Level = 'document'|'item'|'question'|'text'|'options'|'answer'
interface Config {
	document: {title: string, val: string}[]
	item: {title: string, val: string}[]
	question: {title: string, val: string}[]
	text: {title: string, val: string}[]
	options: {title: string, val: string}[]
	answer: {title: string, val: string}[]
}

interface Message {
	command: string
	params?: any[]
}

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
	const document = await vscode.workspace.openTextDocument({language: 'markdown', content: txt})
	editor = await vscode.window.showTextDocument(document)
	if (panel)
		panel.reveal(vscode.ViewColumn.Two)
	else {
		panel = vscode.window.createWebviewPanel('htmlPreview', 'PDF to Anki cloze', vscode.ViewColumn.Two, {enableScripts: true})
		panel.webview.html = load_panel()
		panel.webview.onDidReceiveMessage(listener, undefined, context.subscriptions)
	}
}

/** Async convert supplied file to text and return string or undefined. */
async function convert(file: string): Promise<string|undefined> {
	try {
		const command = `pdftotext -layout -nodiag -eol unix -nopgbrk "${file}" -`
		const {stderr, stdout} = await exec(command)
		if (stdout && !stderr) return stdout
		vscode.window.showErrorMessage(`Failed to convert PDF: ${stderr}`)
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to convert PDF: ${error}`)
	}
	return undefined
}

/** Listens for postMessage from the WebView panel and executes the appropriate command. */
function listener(msg: Message): void {
	vscode.window.showInformationMessage(`${msg.command}: ${msg.params?.[0]}`)
	switch (msg.command) {
		case 'save':
			save(msg.params![0] as Config)
	}
}


/** Load configuration (regexes etc) from persistent storage and set up panel HTML */
function load_panel(): string {
	const cfg = context.globalState.get(KEY) as Config || {document: [], item: [], question: [], text: [], options: [], answer: []}
	const html = `
			<html><head>
			<script>
				const vscode = acquireVsCodeApi()

				async function add_row(element) {
					while (element.nodeName.toLowerCase() !== 'table')
						element = element.previousElementSibling
					const row = element.insertRow(-1)
					const title = 'fnarf'
					row.innerHTML = '<td style="width: 1px;">' + title + '</td>' +
						'<td style="display: flex;">' +
							'<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;">' +
							'<button onclick="post_re(this)">' +
								'Apply' +
							'</button>' +
							'<button onclick="del_row(this)">' +
								'Delete' +
							'</button>' +
						'</td>'
				}

				function del_row(element) {
					let i
					while (element.nodeName.toLowerCase() !== 'table') {
						if (element.nodeName.toLowerCase() === 'tr') i = element.rowIndex
						element = element.parentElement
					}
					element.deleteRow(i)
				}

				function post_re(element) {
					let input = element
					while (input.nodeName.toLowerCase() !== 'input')
						input = input.previousElementSibling
					let table = element
					while (table.nodeName.toLowerCase() !== 'table')
						table = table.parentElement
					const cmd = table.id + '.re'
					const param = input.value
					vscode.postMessage({
						command: cmd,
						params: [param]
					})
				}

				function save() {
					const data = {
						document: [],
						item: [],
						question: [],
						text: [],
						options: [],
						answer: []
					}
				
					for (const section of Object.keys(data)) {
						for (const row of document.querySelectorAll('table#' + section + ' tr')) {
							data[section].push({
								title: row.children[0].innerHTML,
								val: row.querySelector('input')?.value || ''
							})
						}	
					}
					
					vscode.postMessage({
						command: 'save',
						params: [data]
					})
				}
			</script>
			</head><div id="input"><body>
			<b>DOCUMENT</b>
			${level('document', cfg.document)}
			<br><br>
			<b>ITEM</b>
			${level('item', cfg.item)}
			<br><br>
			<b>QUESTION</b>
			${level('question', cfg.question)}
			<br><br>
			<b>TEXT</b>
			${level('text', cfg.text)}
			<br><br>
			<b>OPTIONS</b>
			${level('options', cfg.options)}
			<br><br>
			<b>ANSWER</b>
			${level('answer', cfg.answer)}
			<br><br>
			<button onclick="save()">Save state</button>
			</div></body></html>
	`

	vscode.window.showInformationMessage(html)
	return html

	function level(section: Level, items: {title: string, val: string}[]): string {
		let result = `<table id="${section}">`
		for (const {title, val} of items) {
			result += `<tr>
					<td style="width: 1px;">${title}</td>
					<td style="display: flex;">
						<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;" value="${val}"><input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;" value="${val}">
						<button onclick="post_re(this)">Apply</button>
						<button onclick="del_row(this)">Delete</button>
					</td>
				</tr>
				`
		}
		result += `</table><button onclick="add_row(this)">Add row</button>`
		//vscode.window.showInformationMessage(result)
		return result
	}
}

/** Persist config */
function save(data: Config) {
	vscode.window.showInformationMessage('saving: ' + JSON.stringify(data))
	context.globalState.update(KEY, data)
}

/** Cloze the supplied string to Anki HTML. */
function cloze(str: string): string {
	return '<b>clozed</b>'
}

/** Called when extension is deactivated */
export function deactivate() {
	panel?.dispose()
}
