import * as vscode from 'vscode'

export declare type VsCodeApi = {
    postMessage(message: any): void
    setState(state: any): void
    getState(): any
}

export declare type Level = 'document'|'item'|'question'|'options'|'answer'
export declare type RxItem = {label: string, rx: string}
export declare type Config = {
	document?: RxItem[]
	item?: RxItem[]
	question?: RxItem[]
	options?: RxItem[]
	answer?: RxItem[]
	last_uri?: vscode.Uri
}

export declare type Message = {
	command: string
	params?: any[]
}


/** Global state storage key */
export const KEY = 'pdftocloze'
/** Separator between items/question-options-answers */
export const ITEM_SEP = '************************************************'
/** Separator between question text and question options */
export const OPTIONS_SEP = '-------------------------------------------------'
/** Separator between the question (and any options) and answer */
export const ANSWER_SEP = '_________________________________________________'
