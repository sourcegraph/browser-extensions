import { last } from 'lodash'

const matchCommitURL = (url: URL) => url.pathname.match(/\/(.*?)\/src\/commit\/(.*?)\/(.*)/)

const getFileInfoFromCommitURL = (commitURL: URL) => {
    const match = matchCommitURL(commitURL)!

    const repoName = match[1]
    const commitID = match[2]
    const filePath = match[3]

    const revMatch = window.location.pathname.match(new RegExp(`${repoName}/src/branch/(.*?)/${filePath}`))
    const rev = (revMatch && revMatch[1]) || commitID

    return {
        repoPath: `${commitURL.hostname}/${repoName}`,
        filePath,
        rev,
        commitID,
    }
}

const buildGetFileInfoFromCodeView = (actionsSelector: string) => (codeView: HTMLElement) => {
    const url = new URL(window.location.href)
    const match = matchCommitURL(url)
    if (match) {
        return getFileInfoFromCommitURL(url)
    }

    for (const link of codeView.querySelectorAll<HTMLAnchorElement>(actionsSelector)) {
        if (link.textContent === 'Permalink' || link.textContent === 'View File') {
            return getFileInfoFromCommitURL(new URL(link.href))
        }
    }

    throw new Error('Could not resolve file info for code view')
}

export const getFileInfoFromCodeView = buildGetFileInfoFromCodeView('.file-actions a')
export const getDiffFileInfo = buildGetFileInfoFromCodeView('a')

export const getDiffBaseRevision = () => {
    const aSelector = 'a.sha'
    const anchor = document.querySelector<HTMLAnchorElement>(aSelector)
    if (!anchor) {
        throw new Error(`Unable to find sha for '${aSelector}'`)
    }

    return last(anchor.href.split('/'))
}
