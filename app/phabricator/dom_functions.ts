import { DOMFunctions } from '@sourcegraph/codeintellify'

/**
 * Implementations of the DOM functions for diff code views on Phabricator
 */
export const diffDomFunctions: DOMFunctions = {
    getCodeElementFromTarget: target => {
        if (target.tagName === 'TH' || target.classList.contains('copy')) {
            return null
        }

        return target.closest('td')
    },
    getCodeElementFromLineNumber: (codeView, line, part) => {
        const lineNumberCells = codeView.querySelectorAll(`th:nth-of-type(${part === 'base' ? 1 : 2})`)
        for (const lineNumberCell of lineNumberCells) {
            if (lineNumberCell.textContent && parseInt(lineNumberCell.textContent, 10) === line) {
                let codeElement = lineNumberCell.nextElementSibling
                while (codeElement && (codeElement.tagName !== 'TD' || codeElement.classList.contains('copy'))) {
                    codeElement = lineNumberCell.nextElementSibling
                }

                return codeElement as HTMLElement | null
            }
        }

        return null
    },
    getLineNumberFromCodeElement: codeElement => {
        let elem: HTMLElement | null = codeElement
        while (elem && elem.tagName !== 'TH') {
            elem = elem.previousElementSibling as HTMLElement
        }

        return parseInt(elem.textContent!, 10)
    },
    getDiffCodePart: codeElement => {
        // Changed lines have handy class names.
        if (codeElement.classList.contains('old')) {
            return 'base'
        }
        if (codeElement.classList.contains('new')) {
            return 'head'
        }

        // For diffs, we'll have to traverse back to the line number <th> and see if it is the last element to determin
        // whether it was the base or head.
        let elem: HTMLElement = codeElement
        while (elem.tagName !== 'TH') {
            if (!elem.previousElementSibling) {
                throw Error('could not find line number cell from code element')
            }
            elem = elem.previousElementSibling as HTMLElement
        }

        // In unified diffs, both <th>'s have a class telling us which side of the diff the line belongs to.
        if (elem.classList.contains('left')) {
            return 'base'
        }
        if (elem.classList.contains('right')) {
            return 'head'
        }

        return elem.previousElementSibling ? 'head' : 'base'
    },
}
