import { CodeHost, CodeView } from '../code_intelligence'
import { getLineRanges } from '../github/dom_functions'
import { domFunctions } from './dom_functions'
import { resolveFileInfo } from './file_info'

const createToolbarMount = (codeView: HTMLElement) => {
    const fileHeader = codeView.querySelector<HTMLElement>('.filename-row th')
    if (!fileHeader) {
        throw new Error('Unable to find mount location')
    }

    const mount = document.createElement('div')
    mount.style.display = 'inline-flex'
    mount.style.verticalAlign = 'middle'
    mount.style.alignItems = 'center'
    mount.style.cssFloat = 'right'

    fileHeader.insertAdjacentElement('afterbegin', mount)

    // fileHeader.style.overflow = 'visible'

    console.log(mount, codeView)
    return mount
}

const codeView: CodeView = {
    selector: '.diff-container',
    dom: domFunctions,
    isDiff: true,
    getToolbarMount: createToolbarMount,
    resolveFileInfo,
    toolbarButtonProps: {
        className: '',
        style: {},
    },
    getLineRanges,
}

export const checkIsReviewBoard = () => document.body.classList.contains('reviewable-page')

export const reviewBoardCodeHost: CodeHost = {
    name: 'review-board',
    check: checkIsReviewBoard,
    codeViews: [codeView],
}
