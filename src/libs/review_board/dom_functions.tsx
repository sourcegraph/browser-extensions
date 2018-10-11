import { DiffPart, DOMFunctions } from '@sourcegraph/codeintellify'
import { CodeView } from '../code_intelligence'

export const domFunctions: DOMFunctions = {
    getCodeElementFromTarget: target => target.closest('pre'),
    getCodeElementFromLineNumber: (codeView, line, part) => {
        for (const lineNum of codeView.querySelectorAll(`th:${part === 'base' ? 'first-of-type' : 'last-of-type'}`)) {
            if (parseInt((lineNum.textContent || '').trim(), 10) === line) {
                return lineNum.closest('tr')!.querySelector(`td.${part === 'base' ? 'l' : 'r'} pre`)
            }
        }

        return null
    },
    getLineNumberFromCodeElement: codeElement =>
        parseInt((codeElement.previousElementSibling!.textContent || '').trim(), 10),
    getDiffCodePart: (codeElement: HTMLElement): DiffPart => {
        const td = codeElement.closest('td')!
        // If there are more cells on the right, this is the base, otherwise the head
        return td.classList.contains('l') ? 'base' : 'head'
    },
}

export const getLineRanges: CodeView['getLineRanges'] = (codeView, part) => {
    const ranges: { start: number; end: number }[] = []

    for (const body of codeView.querySelectorAll('tbody')) {
        const getLineNum = (which: 'first' | 'last') => {
            const row = body.querySelector(`tr.${which}`)
            if (!row) {
                return null
            }

            const lineNum = row.querySelector<HTMLElement>(`td:${part === 'base' ? 'first-of-type' : 'last-of-type'}`)!

            return parseInt((lineNum.textContent || '').trim(), 10)
        }

        const start = getLineNum('first')
        const end = getLineNum('last')

        if (start && end) {
            ranges.push({ start, end })
        }
    }

    return ranges
}
