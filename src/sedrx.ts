export interface Rx {
    find: string
    replace: string|null
    flags: string
}

export function sedrx(rx: string): Rx|null {
  if (rx.startsWith('s')) {
    // substitution
    const m = rx.match(/^s([^\w\s])(.*?)(?:(?<!\\)(?:\\\\)*|(?<!\\))\1(.*?)(?:(?<!\\)(?:\\\\)*|(?<!\\))\1([gimsuy]*)$/)
    if (!m) return null
    return {
      find: m[2],
      replace: m[3] || '',
      flags: m[4] || ''
    }
  } else {
    // find
    const m = rx.match(/^([^\w\s])(.*?)(?:(?<!\\)(?:\\\\)*|(?<!\\))\1([gimsuy]*)$/)
    if (!m) return null
    return {
      find: m[2],
      replace: null,
      flags: m[4] || ''
    }
  }
}