import * as vscode from 'vscode'
import { RxItem, Config, ITEM_SEP, OPTIONS_SEP, ANSWER_SEP, Message } from './constants.js'
import { listener } from './extension.js'
import { sedrx as sedrx_ } from './sedrx.js'

// neccessary as transpilation mangles the imported name which will mess up the .toString() injection
const sedrx = sedrx_

function rx_item(level: string, rx: RxItem): string {
	return `
	<div class="row">
		<input class="label" value="${rx.label}">
		<input class="rx" value="${rx.rx}" oninput="validate_rx(this)">
		<button class="run" onclick="vscode.postMessage({command: '${level}.re', params: [this.previousElementSibling.value]})">Run</button>
		<button class="delete" onclick="this.parentElement.remove()">Del</button>
	</div>
`
}

function add_rx(parent: HTMLElement, rx: RxItem, level: string) {
	const div = document.createElement('div')
	parent.appendChild(div)
	div.outerHTML = rx_item(level, rx)
}

function validate_rx(input: HTMLInputElement) {
	try {
		const rx = sedrx(input.value)
		if (!rx || !rx.find || rx.replace === null)
			throw new Error('Invalid regex')
		new RegExp(rx.find, rx.flags)
		input.style.borderColor = ''
	} catch (e) {
		input.style.borderColor = 'red'
	}
}

function save() {
	function get_vals(level: string): RxItem[] {
		const labels = document.querySelectorAll(`div#${level}-rx input.label`)
		const rxs = document.querySelectorAll(`div#${level}-rx input.rx`)
		const res = []
		for (let i = 0; i < labels.length; i++) {
			res.push({
				label: (labels[i] as HTMLInputElement).value,
				rx: (rxs[i] as HTMLInputElement).value
			} as RxItem)
		}
		return res
	}
	const params = {
		document: get_vals('document'),
		item: get_vals('item'),
		question: get_vals('question'),
		options: get_vals('options'),
		answer: get_vals('answer')
	}
	// @ts-ignore
	vscode.postMessage({command: 'save', params: params})
}


export class PdfToClozePanelProvider implements vscode.WebviewViewProvider {
	private _view?: vscode.WebviewView;
	html: string = ''

    constructor(private readonly extensionUri: vscode.Uri, readonly cfg: Config) {
		this.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
						div.section {
							margin: 20px 0px 20px 0px;
							background-color: var(--vscode-editor-background);
							border: 1px solid var(--vscode-panel-border);
							border-radius: 3px;
							padding: 5px;
						}
						span.label {
							font-weight: bold;
							font-size: 1.2em;
						}
						div.row {
							display: grid;
							grid-template-columns: 1fr 40px 40px;
							grid-template-rows: auto;
							gap: 10px;
  							align-items: center;
							margin: 10px 0px 10px 0px;
							padding-bottom: 10px;
							border-bottom: 1px solid var(--vscode-panelSection-dropBackground)
						}
						div.row > input:nth-child(1) {
							grid-column: 1;
							grid-row: 1;
						}
						div.row > input:nth-child(2) {
							grid-column: 1 / 4;
							grid-row: 2;
						}
						div.row > input:nth-child(3) {
							grid-column: 3;
							grid-row: 1;
						}
						div.row > input:nth-child(4) {
							grid-column: 4;
							grid-row: 1;
						}
						input {
							background-color: var(--vscode-input-background);
							border: 1px solid var(--vscode-input-border);
							color: var(--vscode-input-foreground);
							font-family: var(--vscode-font-family);
							font-size: var(--vscode-font-size);
							font-weight: var(--vscode-font-weight);
							padding: 2px;
							border-radius: 3px;
						}
						button {
							background-color: var(--vscode-editor-background);
							color: var(--vscode-input-foreground);
							border: none; /*1px solid var(--vscode-input-border);*/
							font-family: var(--vscode-font-family);
							font-size: var(--vscode-font-size);
							font-weight: var(--vscode-font-weight);
							padding-bottom: 3px;
							padding-left: 5px;
							padding-right: 5px;
							border-radius: 3px;
						}
						button:hover {
							background-color: var(--vscode-input-background);
						}
						input:focus, button:focus {
							outline: none;
							border-color: var(--vscode-inputOption-activeBorder);
							border-width: 1px;
							border-style: solid;
						}
                </style>
                <script>
                    const vscode = acquireVsCodeApi();
					${rx_item.toString()}
                    ${add_rx.toString()}
                    ${sedrx.toString()}
                    ${validate_rx.toString()}
                    ${save.toString()}
					const empty_rx = {label: '', rx: ''}
                </script>
            </head>
            <body>
				<b>RE format</b>: <code>/^\s+(\S+)/[$1]:/gm</code> (optional leading s, arbitrary delimiter, flags: gmiusy)<br>
				<b>Separators</b>: item ${ITEM_SEP.slice(0, 3)}, options ${OPTIONS_SEP.slice(0, 3)}, answer ${ANSWER_SEP.slice(0, 3)}
				<div class="section">
					<span class="label">DOCUMENT</span>
					<div id="document-rx" class="level">${cfg.document?.map(rx => rx_item('document', rx)).join('') || ''}</div>
					<button class="add" onclick="add_rx(this.previousElementSibling, empty_rx, 'document')">Add</button>
				</div>
				<div class="section">
					<span class="label">ITEM</span>
					<div id="item-rx" class="level">${cfg.item?.map(rx => rx_item('item', rx)).join('') || ''}</div>
					<button class="add" onclick="add_rx(this.previousElementSibling, empty_rx, 'item')">Add</button>
				</div>
				<div class="section">
					<span class="label">QUESTION</span>
					<div id="question-rx" class="level">${cfg.question?.map(rx => rx_item('question', rx)).join('') || ''}</div>
					<button class="add" onclick="add_rx(this.previousElementSibling, empty_rx, 'question')">Add</button>
				</div>
				<div class="section">
					<span class="label">OPTIONS</span>
					<div id="options-rx" class="level">${cfg.options?.map(rx => rx_item('options', rx)).join('') || ''}</div>
					<button class="add" onclick="add_rx(this.previousElementSibling, empty_rx, 'options')">Add</button>
				</div>
				<div class="section">
					<span class="label">ANSWER</span>
					<div id="answer-rx" class="level">${cfg.answer?.map(rx => rx_item('answer', rx)).join('') || ''}</div>
					<button class="add" onclick="add_rx(this.previousElementSibling, empty_rx, 'answer')">Add</button>
				</div>
				<button class="save" onclick="save()">Save</button>
				<button class="cloze" onclick="vscode.postMessage({command: 'cloze'})">Cloze</button>
				<button class="html" onclick="vscode.postMessage({command: 'html'})">HTML</button>
            </body>
            </html>
        `
	}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        }
		webviewView.webview.html ||= this.html
		const listen = webviewView.webview.onDidReceiveMessage(msg => listener(msg))
		webviewView.onDidDispose(() => listen.dispose())
    }
}