import { DOMFunctions } from '@sourcegraph/codeintellify'

import { CodeView } from '../code_intelligence'

export const singleFileDOMFunctions: DOMFunctions = {
    getCodeElementFromTarget: target => target.closest('li'),
    getLineNumberFromCodeElement: codeElement => {
        const rel = codeElement.getAttribute('rel')
        if (!rel) {
            throw new Error(`Unable to find attribute rel for code element`)
        }

        const numStr = rel.trim().replace(/^L/, '')

        return parseInt(numStr, 10)
    },
    getCodeElementFromLineNumber: (codeView, line) => codeView.querySelector(`code .L${line}`),
}

export const getLineRanges = (codeView: HTMLElement) => {
    const first = codeView.querySelector<HTMLElement>('code li:first-of-type')!
    const last = codeView.querySelector<HTMLElement>('code li:last-of-type')!

    return [
        {
            start: singleFileDOMFunctions.getLineNumberFromCodeElement(first),
            end: singleFileDOMFunctions.getLineNumberFromCodeElement(last),
        },
    ]
}

const isCodeViewUnified = (codeView: HTMLElement) => !!codeView.querySelector('.code-diff-unified')

export const diffDOMFunctions: DOMFunctions = {
    getCodeElementFromTarget: target => {
        const row = target.closest('tr')
        if (row && row.classList.contains('tag-code')) {
            return null
        }

        return target.closest('code') as HTMLElement | null
    },
    getLineNumberFromCodeElement: codeElement => {
        let numEl = codeElement.closest('td.lines-code')!.previousElementSibling
        while (numEl && numEl.classList.contains('lines-num') && (numEl.textContent || '').trim() === '') {
            numEl = numEl.previousElementSibling
        }

        if (!numEl) {
            throw new Error('Unable to find line number for code element')
        }

        return parseInt((numEl.textContent || '').trim(), 10)
    },
    getCodeElementFromLineNumber: (codeView, line, part) => {
        for (const lineNum of codeView.querySelectorAll(
            `td.${part === 'base' ? 'lines-num-old' : 'lines-num-new'} span`
        )) {
            const textRaw = lineNum.textContent || ''
            const num = parseInt(textRaw.trim(), 10)
            if (num !== line) {
                continue
            }

            const row = lineNum.closest('tr')!

            let diffSideClassName = ''
            if (part === 'base') {
                diffSideClassName += '.lines-code-old'
            } else if (part === 'head') {
                diffSideClassName += '.lines-code-new'
            }

            if (isCodeViewUnified(codeView)) {
                diffSideClassName = ''
            }

            return row.querySelector(`td.lines-code${diffSideClassName} code`)
        }

        return null
    },
    getDiffCodePart: codeElement => {
        const td = codeElement.closest('td')!
        if (td.classList.contains('lines-code-new')) {
            return 'head'
        }

        if (td.classList.contains('lines-code-old')) {
            return 'base'
        }

        return null
    },
    isFirstCharacterDiffIndicator: () => true,
}

export const getDiffLineRanges: CodeView['getLineRanges'] = (codeView, part) => {
    const ranges: { start: number; end: number }[] = []

    let start: number | null = null
    let end: number | null = null

    for (const row of codeView.querySelectorAll<HTMLTableRowElement>('tr')) {
        const isCode = !row.classList.contains('tag-code')

        if (isCode) {
            const lineNum = row.querySelector<HTMLElement>(`td.${part === 'base' ? 'lines-num-old' : 'lines-num-new'}`)
            if (!lineNum) {
                // Empty row
                continue
            }

            const num = parseInt((lineNum.textContent || '').trim(), 10)
            if (start === null) {
                start = num
            } else {
                end = num
            }
        } else if (start && end) {
            ranges.push({ start, end })

            start = null
            end = null
        }

        if (!isCode) {
            start = null
            end = null
        }
    }

    if (start && end) {
        ranges.push({ start, end })
    }

    return ranges
}
