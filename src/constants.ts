export interface VsCodeApi {
    postMessage(message: any): void
    setState(state: any): void
    getState(): any
}

export declare type Level = 'document'|'item'|'question'|'text'|'options'|'answer'

export declare type Regex = {title: string, regex: string, replacement: string}
export interface Config {
	document: Regex[]
	item: Regex[]
	question: Regex[]
	text: Regex[]
	options: Regex[]
	answer: Regex[]
}

export interface Message {
	command: string
	params?: any[]
}

