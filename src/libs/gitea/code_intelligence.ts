import { CodeHost, CodeView } from '../code_intelligence'
import { diffDOMFunctions, getDiffLineRanges, getLineRanges, singleFileDOMFunctions } from './dom_functions'
import { resolveDiffFileInfo, resolveFileInfo } from './file_info'

export function checkIsGitea(): boolean {
    return !!document.head.querySelector('meta[content="gitea"]')
}

const createToolbarMount = (codeView: HTMLElement) => {
    const fileActions = codeView.querySelector<HTMLElement>('.file-actions')
    if (!fileActions) {
        throw new Error('Unable to find mount location')
    }

    fileActions.style.display = 'flex'

    const mount = document.createElement('div')
    mount.classList.add('btn-group')
    mount.classList.add('sg-toolbar-mount')
    mount.classList.add('sg-toolbar-mount-gitea')

    fileActions.insertAdjacentElement('afterbegin', mount)

    return mount
}

const createDiffToolbarMount = (codeView: HTMLElement) => {
    const filePath = codeView.querySelector<HTMLElement>('.file')
    if (!filePath) {
        throw new Error('Unable to find mount location')
    }

    filePath.style.display = 'flex'

    const mount = document.createElement('div')
    mount.classList.add('btn-group')
    mount.classList.add('sg-toolbar-mount')
    mount.classList.add('sg-toolbar-mount-gitea')

    filePath.insertAdjacentElement('afterend', mount)

    return mount
}

const createCommandPaletteMount = () => {
    const navRight = document.querySelector<HTMLElement>('#navbar .right')!

    const commandListClass = 'command-palette-button'

    const createCommandList = (): HTMLElement => {
        const commandListElem = document.createElement('div')
        commandListElem.className = commandListClass
        navRight.insertAdjacentElement('afterbegin', commandListElem)

        return commandListElem
    }

    return document.querySelector<HTMLElement>('.' + commandListClass) || createCommandList()
}

const singleFileCodeView: CodeView = {
    selector: '.non-diff-file-content',
    getToolbarMount: createToolbarMount,
    dom: singleFileDOMFunctions,
    resolveFileInfo,
    getLineRanges,
    toolbarButtonProps: {
        className: 'ui button',
        style: {},
    },
}

const diffCodeView: CodeView = {
    selector: '.diff-file-box',
    getToolbarMount: createDiffToolbarMount,
    dom: diffDOMFunctions,
    resolveFileInfo: resolveDiffFileInfo,
    getLineRanges: getDiffLineRanges,
    isDiff: true,
    toolbarButtonProps: {
        className: 'ui button',
        style: {},
    },
}

export const giteaCodeHost: CodeHost = {
    name: 'gitea',
    check: checkIsGitea,
    codeViews: [singleFileCodeView, diffCodeView],
    getCommandPaletteMount: createCommandPaletteMount,
}
