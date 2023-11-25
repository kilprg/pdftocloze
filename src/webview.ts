import { Config, Level, VsCodeApi } from "./constants"


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

		while (element && element.nodeName.toLowerCase() !== 'table')
			element = element.previousElementSibling as HTMLElement
		const row = (element as HTMLTableElement).insertRow(-1)
		row.innerHTML = `
			<td style="width: 1px; white-space: nowrap;">${title}</td>
			<td style="display: flex;">
				<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;">
				<input type="text" style="flex-grow: 1;flex-shrink: 1;margin-right: 10px;box-sizing: border-box;">
				<button onclick="post_re(this, vscode)">Apply</button>
				<button onclick="del_row(this)">Delete</button>
			</td>
			`
		
		dialog.remove()
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
	while (element && element.nodeName.toLowerCase() !== 'input')
		element = element.previousElementSibling as HTMLElement
	const input = [(element.previousElementSibling as HTMLInputElement).value, (element as HTMLInputElement).value]
	while (element && element.nodeName.toLowerCase() !== 'table')
		element = element.parentElement as HTMLElement
	const cmd = `${element.id}.re`
	vscode.postMessage({
		command: cmd,
		params: input
	})
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
				title: row.children[0].innerHTML,
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
