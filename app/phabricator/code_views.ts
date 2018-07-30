import { DiffPart } from '@sourcegraph/codeintellify'
import { CodeViewInfo } from '../code_intelligence/inject'
import { diffDomFunctions } from './dom_functions'
import { createDifferentialContextResolver } from './file_info'

function createDifferentialToolbarMount(file: HTMLElement, part: DiffPart): HTMLElement {
    const className = 'sourcegraph-app-annotator' + (part === 'base' ? '-base' : '')
    const existingMount = file.querySelector('.' + className)
    if (existingMount) {
        // Make this function idempotent; no need to create a mount twice.
        return existingMount as HTMLElement
    }

    const mount = document.createElement('div')
    mount.style.display = 'inline-block'
    mount.classList.add(className)

    const actionLinks = file.querySelector('.differential-changeset-buttons')
    if (!actionLinks) {
        throw new Error('Unable to find action links for changeset')
    }

    actionLinks.appendChild(mount)

    return mount
}

export const phabCodeViews: CodeViewInfo[] = [
    {
        selector: '.differential-changeset',
        dom: diffDomFunctions,
        getToolbarMount: createDifferentialToolbarMount,
        createContextResolver: createDifferentialContextResolver,
    },
]
