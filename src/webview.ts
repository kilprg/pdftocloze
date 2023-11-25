const vscode = acquireVsCodeApi()

async function add_row(element: HTMLElement) {
	while (element && element.nodeName.toLowerCase() !== 'table')
		element = element.previousElementSibling as HTMLElement
	const row = (element as HTMLTableElement).insertRow(-1)
	const title = 'fnarf'
	row.innerHTML = `<td style="width: 1px;">${title}</td>' +
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