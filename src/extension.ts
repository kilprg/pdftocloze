import * as vscode from 'vscode'
import * as util from 'util'
import { exec as exec_ } from 'child_process'
import {Config, Message, KEY, ITEM_SEP, OPTIONS_SEP, ANSWER_SEP} from './constants.js'
import {PdfToClozePanelProvider} from './webview.js'
import MarkdownIt from 'markdown-it'
import {Rx, sedrx} from './sedrx.js'

/* General idea:
 * - Document consists of one or more items
 * - An item may have the following parts, in this order:
 * 	 1. question - text part of a question
 * 	 2. options - options to select from, e.g. a/b/c/d
 *   3. answer - text that is the correct answer (and any explanations)
 * - On replace action the document is reparsed, performing regex at
 *   - document level, before any splitting
 *   - item level
 *   - question/options/answer level
 * - On list action
 * - On cloze action the answer part is enclozed, if it is empty any options are copied into it
*/


/** used to make asynchronify syncronous functions so they are awaitable */
const exec = util.promisify(exec_)

/** Tool panel with regexes etc */
let panel: vscode.WebviewPanel
let context: vscode.ExtensionContext
let config: vscode.WorkspaceConfiguration
let cfg: Config

/** Run on first call */
export function activate(ctx: vscode.ExtensionContext) {
	context = ctx
	config = vscode.workspace.getConfiguration()
	cfg = config.inspect(KEY)?.globalValue as Config || {} as Config
	const provider = new PdfToClozePanelProvider(context.extensionUri, cfg)
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			`${KEY}_regexes_view`,
			provider,
			{webviewOptions: { retainContextWhenHidden: true }}
		),
		vscode.commands.registerCommand(`extension.${KEY}.load_pdf`, load_pdf),
		vscode.commands.registerCommand(`extension.${KEY}.open_panel`, open_panel)
	)
}


/** Select, convert and load PDF, loading configuration and setting up interface as needed */
async function load_pdf() {
	const opts: vscode.OpenDialogOptions = {
		canSelectMany: false,
		openLabel: 'Open',
		filters: {
			'PDF files': ['pdf']
		}
	}
	// set start dir
	if (cfg.last_uri) opts.defaultUri = cfg.last_uri

	const uri = await vscode.window.showOpenDialog(opts)
	if (!uri) return

	// store current dir
	cfg.last_uri = uri[0]
	await config.update(KEY, cfg, vscode.ConfigurationTarget.Global)

	// convert selected file
	const file = uri[0].fsPath
	let txt = await convert(file)
	if (!txt) return

	// normalize text
	txt = txt
		.replace('”', '"')
		.replace('–', '-')
		.replace('\r\n', '\n')
		


	// open text as markdown, create or show the tool panel
	const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: txt })
	await vscode.window.showTextDocument(document, vscode.ViewColumn.One)
	await vscode.commands.executeCommand(`${KEY}_regexes_view.focus`)
}


async function open_panel() {
    await vscode.commands.executeCommand(`${KEY}_regexes_view.focus`)
}


/** Async convert supplied pdf file to text using pdftotext and return string or undefined. */
async function convert(file: string): Promise<string | undefined> {
	let e
	try {
		const command = `pdftotext -layout -nodiag -eol unix -nopgbrk "${file}" -`
		const { stderr, stdout } = await exec(command)
		if (stdout && !stderr) return stdout // success
		e = stderr
	} catch (error) {
		e = error
	}

	vscode.window.showErrorMessage(`Failed to convert PDF: ${e}`)
	return undefined
}


/** Split a string (the document) into array of item strings */
function split_to_items(str: string): string[] {
	return str.split(/^[ \t]*[*]{3,}[ \t]*$/gm).map(s => s.trim()).filter(s => s !== '')
}


/** Join list of item strings separated by ITEM_SEP */
function join_items(items: string[]): string {
	return items.map(i => i.trim()).join(`\n\n${ITEM_SEP}\n\n`).trim()
}


/** Parts of an item */
interface Item {
	question: string
	options?: string
	answer?: string
}


/** Split items in an array into their parts */
function split_to_parts(items: string[]): Item[] {
	const res: Item[] = []
	for(const str of items) {
		// split on options separator
		const s = str.split(/^[ \t]*[\-]{3,}[ \t]*$/m)
		const item: Item = {question: s[0].trim()}
		// no options detected
		if (s.length === 1) {
			// split on answer separator
			const ss = str.split(/^[ \t]*[_]{3,}[ \t]*$/m)
			item.question = ss[0].trim()
			item.answer = ss[1]?.trim() || ''
		// options detected
		} else {
			item.question = s[0].trim()
			// split on answer separator
			const ss = s[1].split(/^[ \t]*[_]{3,}[ \t]*$/m)
			item.options = ss[0].trim()
			item.answer = ss[1]?.trim() || ''
		}
		res.push(item)
	}

	return res
}


/** Join array of items to array of item strings */
function join_parts(items: Item[]): string[] {
	return items.map(itm => {
		let str = itm.question.trim()
		if (itm.options) str += `\n\n${OPTIONS_SEP}\n\n${itm.options.trim()}`
		if (itm.answer) str += `\n\n${ANSWER_SEP}\n\n${itm.answer.trim()}`
		return str.trim()
	})
}


/** Normalize control chars in replacement string */
function normalize(str: string): string {
	return str
		.replace(/\\n/g, '\n') // Newline
		.replace(/\\t/g, '\t') // Tab
		.replace(/\\r/g, '\r') // Carriage return
		.replace(/\\b/g, '\b') // Backspace
		.replace(/\\f/g, '\f') // Form feed
		.replace(/\\v/g, '\v') // Vertical tab
		.replace(/\\\\/g, '\\'); // Backslash
}


/** Replace newlines with hard breaks */
function hard_break(str: string): string {
	return str.replace(/(\S)[ \t]?\n([ \t]*\S)/gm, '$1  \n$2')
}

/** Handle interactions from tool panel, listens for postMessage from the WebView panel and executes the appropriate command. */
export async function listener(msg: Message) {
	vscode.window.showInformationMessage(`${msg.command}: ${msg.params ? JSON.stringify(msg.params) : '-'}`)
	const editor = vscode.window.visibleTextEditors[0]
	const doc = editor?.document
	const text = doc?.getText() || ''
	const rng = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length))
	let rx: Rx|null

	switch (msg.command) {
		// replace on entire document
		case 'document.re': {
			if (rx = sedrx(msg.params![0]))
				editor.edit(build => build.replace(rng, text.replace(new RegExp(rx!.find, rx!.flags), normalize(rx?.replace || ''))))
			break
		}

		// replace at item level
		case 'item.re': {
			if (rx = sedrx(msg.params![0])) {
				const items = split_to_items(text).map(itm => itm.replace(new RegExp(rx!.find, rx!.flags), normalize(rx?.replace || '')))
				editor.edit(build => build.replace(rng, join_items(items)))
			}
			break
		}

		// replace only in question part
		case 'question.re': {
			if (rx = sedrx(msg.params![0])) {
				const item_parts = split_to_parts(split_to_items(text)).map(itm => {
					itm.question = itm.question.replace(new RegExp(rx!.find, rx!.flags), normalize(rx?.replace || ''))
					return itm
				})
				editor.edit(build => build.replace(rng, join_items(join_parts(item_parts))))
			}
			break
		}

		// replace only in options part
		case 'options.re': {
			if (rx = sedrx(msg.params![0])) {
				const item_parts = split_to_parts(split_to_items(text)).map(itm => {
					if (itm.options) itm.options = itm.options.replace(new RegExp(rx!.find, rx!.flags), normalize(rx?.replace || ''))
					return itm
				})
				editor.edit(build => build.replace(rng, join_items(join_parts(item_parts))))
			}
			break
		}

		// replace only in answer part
		case 'answer.re': {
			if (rx = sedrx(msg.params![0])) {
				const item_parts = split_to_parts(split_to_items(text)).map(itm => {
					if (itm.answer) itm.answer = itm.answer.replace(new RegExp(rx!.find, rx!.flags), normalize(rx?.replace || ''))
					return itm
				})
				editor.edit(build => build.replace(rng, join_items(join_parts(item_parts))))
			}
			break
		}

		// cloze each item, if answer is empty copy any existing options, add hard breaks in question and answer
		case 'cloze': {
			const items = split_to_parts(split_to_items(text)).map((itm, i) => {
				const question = hard_break(itm.question)
				const options = itm.options ? `${itm.options}\n\n` : ''
				const answer = hard_break(itm.answer?.trim() || '') || (itm.options?.trim() ? `\n${itm.options.trim()}\n\n` : '')
				return `${question}\n\n${options}{{c${i+1}::${answer}}}`
			})
			editor.edit(build => build.replace(rng, join_items(items)))
			break
		}

		case 'html': {
			const md = new MarkdownIt({
				breaks: false,
				html: true
			})
			md.renderer.rules.paragraph_open = () => ''
			md.renderer.rules.paragraph_close = (tokens, idx, options, env, self) => {
				const nx = tokens[idx + 1]?.type
				return nx === 'paragraph_open' ? '<br><br>' : ''
			}
			md.renderer.rules.softbreak = () => ' '
			const html = md.render(text).replace(/(<\/?(?:div|p|ol|ul|li|hr|blockquote|pre|table|theade|tbody|tfoot|tr|td|th|br|h[1-6]).*?>)\s+/g, '$1')
			editor.edit(build => build.replace(rng, html))
			break
		}

		case 'save': {
			// keep saved last URI
			const old_cfg = config.inspect(KEY)?.globalValue as Config || {} as Config
			cfg = msg.params as Config
			cfg.last_uri = old_cfg.last_uri
			await config.update(KEY, cfg, vscode.ConfigurationTarget.Global)
			break
		}

		default: {
			vscode.window.showErrorMessage(`Unknown tool command "${msg.command}"`)
		}
	}
}


/** Called when extension is deactivated */
export function deactivate() {
	panel?.dispose()
	panel = undefined!
}
