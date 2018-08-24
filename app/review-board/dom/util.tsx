import { DiffPart, DOMFunctions } from '@sourcegraph/codeintellify'

/**
 * Gets the `<td>` element for a target that contains the code
 */
const getCodeCellFromTarget = (target: HTMLElement): HTMLElement | null => {
    if (target.nodeName === 'PRE') {
        return null
    }
    const pre = target.closest('pre') as HTMLElement
    if (!pre) {
        return null
    }
    if (target.innerText.trim().length === 0) {
        return null
    }
    const closest = (target.closest('.l') || target.closest('.r')) as HTMLElement
    if (!closest.classList.contains('trimmed') && closest.classList.contains('annotated')) {
        const firstChild = closest.firstElementChild
        if (
            firstChild &&
            firstChild.nodeName === 'SPAN' &&
            firstChild.textContent &&
            firstChild.innerHTML.trim().length === 0
        ) {
            const newElement = document.createElement('span')
            newElement.innerHTML = ' '
            closest.replaceChild(newElement, firstChild)
        }
        closest.classList.add('trimmed')
    }
    return closest
}

const getBlobCodeInner = (codeCell: HTMLElement) => {
    if (codeCell.classList.contains('l') || codeCell.classList.contains('r')) {
        return codeCell
    }
    return (codeCell.closest('.l') || codeCell.closest('.r')) as HTMLElement
}

/**
 * Gets the line number for a given code element on unified diff, split diff and blob views
 */
const getLineNumberFromCodeElement = (codeElement: HTMLElement): number => {
    // In diff views, the code element is the `<span>` inside the cell
    // On blob views, the code element is the `<td>` itself, so `closest()` will simply return it
    // Walk all previous sibling cells until we find one with the line number
    let cell = codeElement.closest('td') as HTMLElement
    while (cell) {
        if (cell.nodeName === 'TH') {
            return parseInt(cell.innerText, 10)
        }
        cell = cell.previousElementSibling as HTMLTableRowElement
    }

    cell = codeElement.closest('tr')! as HTMLTableRowElement
    if (cell.getAttribute('line')) {
        return parseInt(cell.getAttribute('line')!, 10)
    }
    throw new Error('Could not find a line number in any cell')
}

/**
 * getDeltaFileName returns the path of the file container. Reviewboard will always be a diff.
 */
export function getDeltaFileName(container: HTMLElement): { headFilePath: string; baseFilePath: string } {
    const info = container.querySelector('.filename-row') as HTMLElement
    if (!info) {
        throw new Error(`Unable to getDeltaFileName for container: ${container}`)
    }
    return { headFilePath: info.innerText, baseFilePath: info.innerText }
}

const getDiffCodePart = (codeElement: HTMLElement): DiffPart => {
    const td = codeElement.closest('td')!
    // If there are more cells on the right, this is the base, otherwise the head
    return td.classList.contains('l') ? 'base' : 'head'
}

/**
 * Implementations of the DOM functions for diff code views
 */
export const diffDomFunctions: DOMFunctions = {
    getCodeElementFromTarget: target => {
        const codeCell = getCodeCellFromTarget(target)
        return codeCell && getBlobCodeInner(codeCell)
    },
    getCodeElementFromLineNumber: () => null,
    getLineNumberFromCodeElement,
    getDiffCodePart,
}

/**
 * createBlobAnnotatorMount creates a <div> element and adds it to the DOM
 * where the BlobAnnotator component should be mounted.
 */
export function createBlobAnnotatorMount(fileContainer: HTMLElement, isBase?: boolean): HTMLElement | null {
    const className = 'sourcegraph-app-annotator' + (isBase ? '-base' : '')
    const existingMount = fileContainer.querySelector('.' + className) as HTMLElement
    if (existingMount) {
        return existingMount
    }

    const mountEl = document.createElement('div')
    mountEl.style.display = 'inline-flex'
    mountEl.style.verticalAlign = 'middle'
    mountEl.style.alignItems = 'center'
    mountEl.className = className
    mountEl.style.cssFloat = 'right'

    const fileActions = fileContainer.querySelector('.filename-row') as HTMLElement
    if (!fileActions || !fileActions.firstElementChild) {
        return null
    }
    ;(fileActions.firstElementChild as HTMLElement).style.overflow = 'visible'
    fileActions.firstElementChild!.appendChild(mountEl)
    return mountEl
}
