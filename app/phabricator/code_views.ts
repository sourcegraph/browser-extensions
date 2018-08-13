import { AdjustmentDirection, DiffPart, PositionAdjuster } from '@sourcegraph/codeintellify'
import { map } from 'rxjs/operators'
import { CodeViewInfo } from '../code_intelligence/inject'
import { fetchBlobContentLines } from '../repo/backend'
import { diffDomFunctions } from './dom_functions'
import { createDifferentialContextResolver } from './file_info'
import { convertSpacesToTabs, spacesToTabsAdjustment } from './index'

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

const adjustPosition: PositionAdjuster = ({ direction, codeView, position }) =>
    fetchBlobContentLines(position).pipe(
        map(lines => {
            const codeElement = diffDomFunctions.getCodeElementFromLineNumber(codeView, position.line)
            if (!codeElement) {
                throw new Error('(adjustPosition) could not find code element for line provided')
            }

            const documentLineContent = codeElement.textContent!
            const actualLineContent = lines[position.line - 1]

            const convertSpaces = convertSpacesToTabs(
                actualLineContent,
                documentLineContent.substr(position.part ? 1 : 0)
            )

            const modifier = direction === AdjustmentDirection.CodeViewToActual ? -1 : 1

            console.log(
                'convertSpaces',
                convertSpaces,
                convertSpaces
                    ? {
                          line: position.line,
                          character:
                              position.character + spacesToTabsAdjustment(documentLineContent.substr(1)) * modifier,
                      }
                    : position
            )

            return convertSpaces
                ? {
                      line: position.line,
                      character: position.character + spacesToTabsAdjustment(documentLineContent.substr(1)) * modifier,
                  }
                : position
        })
    )

export const phabCodeViews: CodeViewInfo[] = [
    {
        selector: '.differential-changeset',
        dom: diffDomFunctions,
        getToolbarMount: createDifferentialToolbarMount,
        createContextResolver: createDifferentialContextResolver,
        adjustPosition,
    },
]
