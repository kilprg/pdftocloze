import { Config, Level, VsCodeApi } from "./constants"

/** Duplicate from extension.ts - can't include correctly */
export function tr(title: string, regex: string, replacement: string): string {
	//title = title.replace(/^<.*?>(.*?)<\/button>$/, '$1')
	return `
	<td style="width: 1px;white-space: nowrap;padding: 0px;margin: 0px;">
		<button onclick="post_re(this, vscode)" style="width: 100%; box-sizing: border-box;">${title}</button>
	</td>
	<td style="display: flex;padding: 0px; margin: 0px;">
		<input type="text" style="flex-grow: 2;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;font-family: monospace;font-size: 12px;" value="${regex}">
		<input type="text" style="flex-grow: 1;flex-shrink: 2;margin-right: 10px;box-sizing: border-box;font-family: monospace; font-size: 12px;" value="${replacement}">
		<button onclick="del_row(this)">Delete</button>
	</td>
	`
}

export async function add_row(element: HTMLElement) {
	const dialog = document.createElement('dialog')
	dialog.innerHTML = `
		Title: <input type="text">
		<button onclick="this.parentElement.close(this.previousElementSibling.value)">Ok</button>
		`
	document.body.appendChild(dialog)
	dialog.showModal()
	const input = dialog.querySelector('input')
	input?.addEventListener('keypress', (evt) => {
		if (evt.key === 'Enter') dialog.close(input.value)
	})

	dialog.addEventListener('close', () => {
		const title = dialog.returnValue
		dialog.remove()

		while (element && element.nodeName.toLowerCase() !== 'table')
			element = element.parentElement as HTMLElement
		const table = element as HTMLTableElement
		try {
			const row = table.insertRow(table.rows.length - 1)
			row.innerHTML = tr(title, '', '')
		} catch (e) {
			document.write(e as string)
		}
	})
}

export function del_row(element: HTMLElement) {
	let i
	while (element && element.nodeName.toLowerCase() !== 'table') {
		if (element.nodeName.toLowerCase() === 'tr')
			i = (element as HTMLTableRowElement).rowIndex
		element = element.parentElement as HTMLElement
	}
	(element as HTMLTableElement).deleteRow(i!)
}

export function post_re(element: HTMLElement, vscode: VsCodeApi) {
	while (element && element.nodeName.toLowerCase() !== 'tr')
		element = element.parentElement as HTMLElement
	const elements = element.querySelectorAll('input')
	const input = [(elements[0] as HTMLInputElement).value, (elements[1] as HTMLInputElement).value]
	while (element && element.nodeName.toLowerCase() !== 'table')
		element = element.parentElement as HTMLElement
	const cmd = `${element.id}.re`
	vscode.postMessage({
		command: cmd,
		params: input
	})
}

export function join_lines(element: HTMLElement, vscode: VsCodeApi) {
	while (element && element.nodeName.toLowerCase() !== 'table')
		element = element.parentElement as HTMLElement
	const cmd = `${element.id}.join`
	vscode.postMessage({command: cmd})
}

export function lists(element: HTMLElement, vscode: VsCodeApi) {
	while (element && element.nodeName.toLowerCase() !== 'table')
		element = element.previousElementSibling as HTMLElement
	const cmd = `${element.id}.lists`
	vscode.postMessage({command: cmd})
}

export function save(vscode: VsCodeApi) {
	const data: Config = {
		document: [],
		item: [],
		question: [],
		text: [],
		options: [],
		answer: []
	}

	for (const section of Object.keys(data)) {
		for (const row of document.querySelectorAll(`table#${section} tr`)) {
			const input = row.querySelectorAll('input')
			data[section as Level].push({
				title: row.children[0].firstElementChild!.innerHTML,
				regex: input[0]?.value || '',
				replacement: input[1]?.value || ''
			})
		}	
	}
	
	vscode.postMessage({
		command: 'save',
		params: [data]
	})
}
