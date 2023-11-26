import * as vscode from 'vscode'

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
	uri?: vscode.Uri
}

export interface Message {
	command: string
	params?: any[]
}

export const ROMAN_MAP: [number, string][] = [
	[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
	[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
]

