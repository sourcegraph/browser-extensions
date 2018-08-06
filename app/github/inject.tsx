import {
    createHoverifier,
    DOMFunctions,
    findPositionsFromEvents,
    Hoverifier,
    HoverOverlay,
    HoverState,
    LinkComponent,
} from '@sourcegraph/codeintellify'
import { propertyIsDefined } from '@sourcegraph/codeintellify/lib/helpers'
import { HoverMerged } from '@sourcegraph/codeintellify/lib/types'
import { CXPCommandListPopoverButton } from '@sourcegraph/extensions-client-common/lib/cxp/CXPCommandList'
import { CXPStatusPopover } from '@sourcegraph/extensions-client-common/lib/cxp/CXPStatus'
import { ContributableMenu } from 'cxp/module/protocol'
import { identity } from 'lodash'
import mermaid from 'mermaid'
import * as React from 'react'
import { render, unmountComponentAtNode } from 'react-dom'
import { forkJoin, from, of, Subject } from 'rxjs'
import { filter, map, withLatestFrom } from 'rxjs/operators'
import { Disposable } from 'vscode-languageserver/lib/main'
import { findElementWithOffset, getTargetLineAndOffset, GitHubBlobUrl } from '.'
import storage from '../../extension/storage'
import { getContext } from '../backend/context'
import { applyDecoration, CXP_CONTROLLER, CXP_EXTENSIONS_CONTEXT_CONTROLLER, rootAndComponent } from '../backend/cxp'
import { queryGraphQL } from '../backend/graphql'
import { createJumpURLFetcher, fetchHover, JumpURLLocation, toTextDocumentIdentifier } from '../backend/lsp'
import { Alerts } from '../components/Alerts'
import { BlobAnnotator } from '../components/BlobAnnotator'
import { CodeViewToolbar } from '../components/CodeViewToolbar'
import { ContextualSourcegraphButton } from '../components/ContextualSourcegraphButton'
import { EnableSourcegraphServerButton } from '../components/EnableSourcegraphServerButton'
import { ServerAuthButton } from '../components/ServerAuthButton'
import { SymbolsDropdownContainer } from '../components/SymbolsDropdownContainer'
import { WithResolvedRev } from '../components/WithResolvedRev'
import { AbsoluteRepo, AbsoluteRepoFile, CodeCell, DiffResolvedRevSpec } from '../repo'
import { resolveRev, retryWhenCloneInProgressError } from '../repo/backend'
import { getTableDataCell, hideTooltip } from '../repo/tooltips'
import { RepoRevSidebar } from '../tree/RepoRevSidebar'
import {
    eventLogger,
    getModeFromPath,
    inlineSymbolSearchEnabled,
    renderMermaidGraphsEnabled,
    repositoryFileTreeEnabled,
    repoUrlCache,
    sourcegraphUrl,
} from '../util/context'
import * as featureFlags from '../util/featureFlags'
import { blobDOMFunctions, diffDomFunctions, searchCodeSnippetDOMFunctions } from './dom_functions'
import { initSearch } from './search'
import {
    createBlobAnnotatorMount,
    getCodeCells,
    getCodeCommentContainers,
    getDeltaFileName,
    getDiffRepoRev,
    getDiffResolvedRev,
    getFileContainers,
    getGitHubState,
    getRepoCodeSearchContainers,
    isDomSplitDiff,
    parseURL,
} from './util'

const defaultFilterTarget = () => true

const buttonProps = {
    className: 'btn btn-sm tooltipped tooltipped-n',
    style: { marginRight: '5px', textDecoration: 'none', color: 'inherit' },
}

function refreshModules(): void {
    for (const el of Array.from(document.getElementsByClassName('sourcegraph-app-annotator'))) {
        el.remove()
    }
    for (const el of Array.from(document.getElementsByClassName('sourcegraph-app-annotator-base'))) {
        el.remove()
    }
    for (const el of Array.from(document.querySelectorAll('.sg-annotated'))) {
        el.classList.remove('sg-annotated')
    }
    hideTooltip()
    inject()
}

window.addEventListener('pjax:end', () => {
    refreshModules()
})

export function injectGitHubApplication(marker: HTMLElement): void {
    document.body.appendChild(marker)
    inject()
}

function injectCodeIntelligence({ sourcegraphURL }: { sourcegraphURL: string }): void {
    const { repoPath } = parseURL()
    const hoverifier = createCodeIntelligenceContainer({ repoPath })
    injectBlobAnnotators({ hoverifier, sourcegraphURL })
    injectCodeSnippetAnnotator({
        hoverifier,
        containers: getCodeCommentContainers(),
        selector: '.border.rounded-1.my-2',
        dom: blobDOMFunctions,
        sourcegraphURL,
    })
    injectCodeSnippetAnnotator({
        hoverifier,
        containers: getRepoCodeSearchContainers(),
        selector: '.d-inline-block',
        dom: searchCodeSnippetDOMFunctions,
        sourcegraphURL,
    })
}

function injectCXPGlobalComponents({ sourcegraphURL }: { sourcegraphURL: string }): void {
    const statusElem = document.createElement('div')
    statusElem.id = 'cxp-global'
    statusElem.style.position = 'fixed'
    statusElem.style.bottom = '0'
    statusElem.style.right = '0'
    document.body.appendChild(statusElem)
    render(
        <CXPStatusPopover
            cxpController={CXP_CONTROLLER}
            caretIcon={CXP_EXTENSIONS_CONTEXT_CONTROLLER.context.icons.CaretDown}
            loaderIcon={CXP_EXTENSIONS_CONTEXT_CONTROLLER.context.icons.Loader}
        />,
        statusElem
    )

    const headerElem = document.querySelector('ul.user-nav') || document.querySelector('div.HeaderMenu')
    if (headerElem) {
        const commandListElem = document.createElement('div')
        commandListElem.style.marginLeft = '10px'
        headerElem.insertBefore(commandListElem, headerElem.firstChild)
        render(
            <CXPCommandListPopoverButton
                cxpController={CXP_CONTROLLER}
                menu={ContributableMenu.GlobalNav}
                extensions={CXP_EXTENSIONS_CONTEXT_CONTROLLER}
            />,
            commandListElem
        )
    }
}

/**
 * Returns the URL of the first Sourcegraph instance that has the given
 * repository.
 */
const findSourcegraphURLForRepo = (repoPath: string): Promise<string> =>
    queryGraphQL(
        getContext({ repoKey: repoPath, isRepoSpecific: true }),
        `
            query HasRepository(
                $repoPath: String!
            ) {
                repository(uri: $repoPath) {
                    id
                }
            }
        `,
        { repoPath }
    )
        .toPromise()
        // TODO(chris): Return the URL from queryGraphQL instead of assuming it
        // was added to repoUrlCache, or wait until after kingy makes URL list
        // changes.
        .then(() => repoUrlCache[repoPath])

function inject(): void {
    featureFlags
        .isEnabled('newTooltips')
        .then(isEnabled =>
            findSourcegraphURLForRepo(parseURL().repoPath)
                .then(sourcegraphURL => {
                    if (isEnabled) {
                        injectCodeIntelligence({ sourcegraphURL })
                        injectCXPGlobalComponents({ sourcegraphURL })
                    } else {
                        injectBlobAnnotatorsOld()
                        injectCodeSnippetAnnotatorOld({
                            containers: getCodeCommentContainers(),
                            selector: '.border.rounded-1.my-2',
                            isRepoSearch: false,
                        })
                        injectCodeSnippetAnnotatorOld({
                            containers: getRepoCodeSearchContainers(),
                            selector: '.d-inline-block',
                            isRepoSearch: true,
                        })
                    }
                })
                .catch(() => console.warn('No configured Sourcegraph instance has this repository'))
        )
        .catch(() => console.log('could not get feature flag'))

    injectServerBanner()
    injectOpenOnSourcegraphButton()

    injectFileTree()
    injectMermaid()

    initSearch()
    injectInlineSearch()
}

function hideFileTree(): void {
    const tree = document.getElementById('sourcegraph-file-tree')
    document.body.style.marginLeft = '0px'
    if (!tree || !tree.parentNode) {
        return
    }
    tree.parentNode.removeChild(tree)
}

const specChanges = new Subject<{ repoPath: string; commitID: string }>()

function injectFileTree(): void {
    if (!repositoryFileTreeEnabled) {
        return
    }
    const { repoPath } = parseURL()

    if (!repoPath) {
        return
    }
    const pjaxContainer = document.getElementById('js-repo-pjax-container')
    if (!pjaxContainer) {
        return
    }

    let container = document.getElementById('sourcegraph-file-tree-container') as HTMLElement
    let mount = document.getElementById('sourcegraph-file-tree') as HTMLElement
    if (!mount) {
        mount = document.createElement('div')
        mount.id = 'sourcegraph-file-tree'
        mount.className = 'tree-mount'
        mount.setAttribute('data-pjax', 'true')
        container = document.createElement('div')
        container.id = 'sourcegraph-file-tree-container'
        container.className = 'repo-rev-container'
        mount.appendChild(container)
        pjaxContainer.insertBefore(mount, pjaxContainer.firstElementChild!)
    }

    const gitHubState = getGitHubState(window.location.href)
    if (!gitHubState) {
        return
    }
    if (document.querySelector('.octotree')) {
        storage.setSync({ repositoryFileTreeEnabled: false })
        hideFileTree()
        return
    }
    render(
        <WithResolvedRev
            component={RepoRevSidebar}
            className="repo-rev-container__sidebar"
            repoPath={repoPath}
            rev={gitHubState.rev}
            history={history}
            scrollRootSelector="#explorer"
            selectedPath={gitHubState.filePath}
            filePath={gitHubState.filePath}
            location={window.location}
            defaultBranch={'HEAD'}
        />,
        container
    )
    specChanges.next({ repoPath, commitID: gitHubState.rev || '' })
}

const findTokenCell = (td: HTMLElement, target: HTMLElement) => {
    let curr = target
    while (
        curr.parentElement &&
        (curr.parentElement === td || curr.parentElement.classList.contains('blob-code-inner'))
    ) {
        curr = curr.parentElement
    }
    return curr
}

/**
 * injectCodeSnippetAnnotator annotates the given containers and adds a view file button.
 * @param containers The blob containers that holds the code snippet to be annotated.
 * @param selector The selector of the element to append a "View File" button.
 * @param isRepoSearch Whether or not this is a repository search.
 */
function injectCodeSnippetAnnotatorOld({
    containers,
    selector,
    isRepoSearch,
}: {
    containers: HTMLCollectionOf<HTMLElement>
    selector: string
    isRepoSearch: boolean
}): void {
    for (const file of Array.from(containers)) {
        const filePathContainer = file.querySelector(selector)
        if (!filePathContainer) {
            continue
        }
        const anchors = file.getElementsByTagName('a')
        let gitHubState: GitHubBlobUrl | undefined
        for (const anchor of Array.from(anchors)) {
            const anchorState = getGitHubState(anchor.href) as GitHubBlobUrl
            if (anchorState) {
                gitHubState = anchorState
                break
            }
        }

        if (!gitHubState || !gitHubState.owner || !gitHubState.repoName || !gitHubState.rev || !gitHubState.filePath) {
            continue
        }
        const mountEl = document.createElement('div')
        mountEl.style.display = 'none'
        mountEl.className = 'sourcegraph-app-annotator'
        filePathContainer.appendChild(mountEl)

        const getTableElement = () => file.querySelector('table')

        const getCodeCellsCb = () => {
            const opt = { isDelta: false }
            const table = getTableElement()
            const cells: CodeCell[] = []
            if (!table) {
                return cells
            }
            return getCodeCells(table, opt)
        }

        render(
            <WithResolvedRev
                component={BlobAnnotator}
                getTableElement={getTableElement}
                getCodeCells={getCodeCellsCb}
                getTargetLineAndOffset={getTargetLineAndOffset}
                findElementWithOffset={findElementWithOffset}
                findTokenCell={findTokenCell}
                filterTarget={defaultFilterTarget}
                getNodeToConvert={identity}
                fileElement={file}
                repoPath={`${window.location.host}/${gitHubState.owner}/${gitHubState.repoName}`}
                rev={gitHubState.rev}
                filePath={gitHubState.filePath}
                isPullRequest={false}
                isSplitDiff={false}
                isCommit={!isRepoSearch}
                isBase={false}
                buttonProps={buttonProps}
            />,
            mountEl
        )
    }
}

/**
 * injectCodeSnippetAnnotator annotates the given containers and adds a view file button.
 * @param containers The blob containers that holds the code snippet to be annotated.
 * @param selector The selector of the element to append a "View File" button.
 * @param dom Functions for getting code elements from code hosts.
 * @param sourcegraphURL The URL of the Sourcegraph instance that has this repository.
 */
function injectCodeSnippetAnnotator({
    hoverifier,
    containers,
    selector,
    dom,
    sourcegraphURL,
}: {
    hoverifier: Hoverifier
    containers: HTMLCollectionOf<HTMLElement>
    selector: string
    dom: DOMFunctions
    sourcegraphURL: string
}): void {
    for (const file of containers) {
        const filePathContainer = file.querySelector(selector)
        if (!filePathContainer) {
            continue
        }

        const anchors = file.getElementsByTagName('a')
        let gitHubState: GitHubBlobUrl | undefined
        for (const anchor of Array.from(anchors)) {
            const anchorState = getGitHubState(anchor.href) as GitHubBlobUrl
            if (anchorState) {
                gitHubState = anchorState
                break
            }
        }

        if (!gitHubState || !gitHubState.owner || !gitHubState.repoName || !gitHubState.rev || !gitHubState.filePath) {
            continue
        }

        const { rev, filePath, repoName, owner } = gitHubState!
        const repoPath = `${window.location.host}/${owner}/${repoName}`

        const mount = document.createElement('div')
        mount.style.display = 'none'
        mount.className = 'sourcegraph-app-annotator'
        filePathContainer.appendChild(mount)

        const renderCodeView = (commitID: string) =>
            render(
                <CodeViewToolbar
                    repoPath={repoPath}
                    filePath={filePath}
                    baseCommitID={commitID}
                    baseRev={commitID}
                    buttonProps={buttonProps}
                    extensions={CXP_EXTENSIONS_CONTEXT_CONTROLLER}
                    cxpController={CXP_CONTROLLER}
                />,
                mount
            )

        resolveRev({ repoPath, rev })
            .pipe(retryWhenCloneInProgressError())
            .subscribe(
                commitID => {
                    hoverifier.hoverify({
                        dom,
                        positionEvents: of(file).pipe(findPositionsFromEvents(dom)),
                        resolveContext: () => ({
                            repoPath,
                            filePath: filePath!,
                            rev: rev || commitID,
                            commitID,
                        }),
                    })
                    renderCodeView(commitID)
                },
                err => console.error(repoPath, rev, err)
            )
    }
}

function injectServerBanner(): void {
    if (window.localStorage['server-banner-enabled'] !== 'true') {
        return
    }

    const { isPullRequest, repoPath } = parseURL()
    if (!isPullRequest) {
        return
    }
    // Check which files were modified.
    const files = getFileContainers()
    if (!files.length) {
        return
    }

    let mount = document.getElementById('server-alert-mount')
    if (!mount) {
        mount = document.createElement('div')
        mount.id = 'server-alert-mount'
        const container = document.getElementById('partial-discussion-header')
        if (!container) {
            return
        }
        container.appendChild(mount)
    }
    render(<Alerts repoPath={repoPath} />, mount)
}

function createCodeIntelligenceContainer(options?: { repoPath: string }): Hoverifier {
    const overlayMountID = 'sg-tooltip-mount'

    let overlayMount = document.getElementById(overlayMountID)
    if (!overlayMount) {
        overlayMount = document.createElement('div')
        overlayMount.id = overlayMountID
        overlayMount.style.height = '0px'
        document.body.appendChild(overlayMount)
    } else {
        // "Force reload" code intelligence.
        unmountComponentAtNode(overlayMount)
        for (const highlighted of document.querySelectorAll('.selection-highlight')) {
            highlighted.classList.remove('selection-highlight')
        }
    }

    /** Emits when the go to definition button was clicked */
    const goToDefinitionClicks = new Subject<MouseEvent>()
    const nextGoToDefinitionClick = (event: MouseEvent) => goToDefinitionClicks.next(event)

    /** Emits when the close button was clicked */
    const closeButtonClicks = new Subject<MouseEvent>()
    const nextCloseButtonClick = (event: MouseEvent) => closeButtonClicks.next(event)

    /** Emits whenever the ref callback for the hover element is called */
    const hoverOverlayElements = new Subject<HTMLElement | null>()
    const nextOverlayElement = (element: HTMLElement | null) => hoverOverlayElements.next(element)

    const relativeElement = document.body

    const fetchJumpURL = createJumpURLFetcher((def: JumpURLLocation) => {
        const rev = def.rev
        // If we're provided options, we can make the j2d URL more specific.
        if (options) {
            const sameRepo = options.repoPath === def.repoPath
            // Stay on same page in PR if possible.
            if (sameRepo && def.part) {
                const containers = getFileContainers()
                for (const container of containers) {
                    const header = container.querySelector('.file-header') as HTMLElement
                    const anchorPath = header.dataset.path
                    if (anchorPath === def.filePath) {
                        const anchorUrl = header.dataset.anchor
                        const url = `${window.location.origin}${window.location.pathname}#${anchorUrl}${
                            def.part === 'base' ? 'L' : 'R'
                        }${def.position.line}`

                        return url
                    }
                }
            }
        }

        return `https://${def.repoPath}/blob/${rev}/${def.filePath}#L${def.position.line}${
            def.position.character ? ':' + def.position.character : ''
        }`
    })

    const containerComponentUpdates = new Subject<void>()

    const hoverifier = createHoverifier({
        closeButtonClicks,
        goToDefinitionClicks,
        hoverOverlayElements,
        hoverOverlayRerenders: containerComponentUpdates.pipe(
            withLatestFrom(hoverOverlayElements),
            map(([, hoverOverlayElement]) => ({ hoverOverlayElement, relativeElement })),
            filter(propertyIsDefined('hoverOverlayElement'))
        ),
        pushHistory: path => {
            location.href = path
        },
        fetchHover: ({ line, character, part, ...rest }) =>
            fetchHover({ ...rest, position: { line, character } }).pipe(
                map(hover => (hover ? (hover as HoverMerged) : hover))
            ),
        fetchJumpURL,
        logTelemetryEvent: () => eventLogger.logCodeIntelligenceEvent(),
    })

    class HoverOverlayContainer extends React.Component<{}, HoverState> {
        constructor(props: {}) {
            super(props)
            this.state = hoverifier.hoverState
            hoverifier.hoverStateUpdates.subscribe(update => this.setState(update))
        }
        public componentDidMount(): void {
            containerComponentUpdates.next()
        }
        public componentDidUpdate(): void {
            containerComponentUpdates.next()
        }
        public render(): JSX.Element | null {
            return this.state.hoverOverlayProps ? (
                <HoverOverlay
                    {...this.state.hoverOverlayProps}
                    linkComponent={LinkComponent}
                    logTelemetryEvent={this.log}
                    hoverRef={nextOverlayElement}
                    onGoToDefinitionClick={nextGoToDefinitionClick}
                    onCloseButtonClick={nextCloseButtonClick}
                />
            ) : null
        }
        private log = () => eventLogger.logCodeIntelligenceEvent()
    }

    render(<HoverOverlayContainer />, overlayMount)

    return hoverifier
}

const LinkComponent: LinkComponent = ({ to, children, ...rest }) => (
    <a href={new URL(to, sourcegraphUrl).href} {...rest}>
        {children}
    </a>
)

// TODO(chris) figure out when to update root+component

const mkUri = (ctx: AbsoluteRepo) => `git://${ctx.repoPath}?${ctx.commitID}`
const mkUriPath = (ctx: AbsoluteRepoFile) => `git://${ctx.repoPath}?${ctx.commitID}#${ctx.filePath}`

function injectBlobAnnotators({
    hoverifier,
    sourcegraphURL,
}: {
    hoverifier: Hoverifier
    sourcegraphURL: string
}): void {
    const { repoPath, isDelta, filePath, rev } = parseURL()
    if (!filePath && !isDelta) {
        return
    }

    function addBlobAnnotator(file: HTMLElement): void {
        const diffLoader = file.querySelector('.js-diff-load-container')
        if (diffLoader) {
            const observer = new MutationObserver(() => {
                const element = diffLoader.querySelector('.diff-table')
                if (element) {
                    addBlobAnnotator(file)
                    observer.disconnect()
                }
            })
            observer.observe(diffLoader, { childList: true })
        }

        if (!isDelta) {
            const mount = createBlobAnnotatorMount(file)
            if (!mount) {
                return
            }

            const renderCodeView = (commitID: string) =>
                render(
                    <CodeViewToolbar
                        repoPath={repoPath}
                        filePath={filePath!}
                        baseCommitID={commitID}
                        baseRev={commitID}
                        buttonProps={buttonProps}
                        extensions={CXP_EXTENSIONS_CONTEXT_CONTROLLER}
                        cxpController={CXP_CONTROLLER}
                    />,
                    mount
                )

            resolveRev({ repoPath, rev })
                .pipe(retryWhenCloneInProgressError())
                .subscribe(
                    commitID => {
                        // This won't get called if there wasn't a hoverifier
                        hoverifier!.hoverify({
                            dom: blobDOMFunctions,
                            positionEvents: of(file).pipe(findPositionsFromEvents(blobDOMFunctions)),
                            resolveContext: () => ({
                                repoPath,
                                filePath: filePath!,
                                rev: rev || commitID,
                                commitID,
                            }),
                        })

                        renderCodeView(commitID)
                    },
                    err => console.error(err)
                )

            return
        }

        const { headFilePath, baseFilePath } = getDeltaFileName(file)
        if (!headFilePath) {
            console.error('cannot determine file path')
            return
        }

        let baseCommitID: string
        let headCommitID: string
        const deltaRevs = getDiffResolvedRev()
        if (!deltaRevs) {
            console.error('cannot determine deltaRevs')
            return
        }

        baseCommitID = deltaRevs.baseCommitID
        headCommitID = deltaRevs.headCommitID

        const deltaInfo = getDiffRepoRev()
        if (!deltaInfo) {
            console.error('cannot determine deltaInfo')
            return
        }

        forkJoin(
            resolveRev({ repoPath, rev: baseCommitID }).pipe(retryWhenCloneInProgressError()),
            resolveRev({ repoPath, rev: headCommitID }).pipe(retryWhenCloneInProgressError())
        )
            .pipe(
                map(
                    ([baseCommitID, headCommitID]): DiffResolvedRevSpec => ({
                        baseCommitID,
                        headCommitID,
                    })
                )
            )
            .subscribe(resolvedRevSpec => {
                const mount = createBlobAnnotatorMount(file, true)
                if (mount) {
                    render(
                        <CodeViewToolbar
                            repoPath={repoPath}
                            filePath={headFilePath}
                            baseCommitID={baseCommitID}
                            headCommitID={headCommitID}
                            buttonProps={buttonProps}
                            extensions={CXP_EXTENSIONS_CONTEXT_CONTROLLER}
                            cxpController={CXP_CONTROLLER}
                        />,
                        mount
                    )
                }

                // This won't get called if there wasn't a hoverifier
                hoverifier!.hoverify({
                    dom: diffDomFunctions,
                    positionEvents: of(file).pipe(findPositionsFromEvents(diffDomFunctions)),
                    resolveContext: ({ part }) => ({
                        repoPath,
                        rev: part === 'base' ? resolvedRevSpec.baseCommitID : resolvedRevSpec.headCommitID,
                        commitID: part === 'base' ? resolvedRevSpec.baseCommitID : resolvedRevSpec.headCommitID,
                        // If a hover happened on the base, it must exist
                        filePath: part === 'base' ? baseFilePath! : headFilePath,
                    }),
                })
            })
    }

    // Get first loaded files and annotate them.
    const files = getFileContainers()
    for (const file of Array.from(files)) {
        addBlobAnnotator(file as HTMLElement)
    }

    if (files.length === 1 && filePath) {
        // TODO(chris) verify this is actually a blob page before fetching file
        // content from GitHub and applying decorations

        // TODO(chris) cxp only supports one component at a time

        // TODO(chris) dispose of the decorations after pjax changes (er, this
        // might not be very important. The DOM probably gets reconstructed
        // anyway)

        // TODO(chris) figure out how to propagate the "Enable CXP" option here
        // and clear/fetch the decorations on toggle

        // TODO(chris) consolidate resolveRev calls (maybe just memoize it for
        // now)

        const gitHubState = getGitHubState(window.location.href) as GitHubBlobUrl

        // TODO(chris) handle errors
        const gitHubFileContent = ({ owner, repoName, filePath }) =>
            from(
                fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`)
                    .then(response => response.json())
                    .then(response => window.atob(response.content))
            )

        let oldDecorations: Disposable[] = []

        forkJoin(
            resolveRev({ repoPath, rev }).pipe(retryWhenCloneInProgressError()),
            gitHubFileContent(gitHubState)
        ).subscribe(([commitID, fileContent]) => {
            rootAndComponent.next({
                root: mkUri({ repoPath, commitID }),
                component: {
                    document: {
                        uri: mkUriPath({ repoPath, commitID, filePath }),
                        // TODO(chris) handle unknown modes
                        languageId: getModeFromPath(filePath) || 'could not determine mode',
                        version: 0,
                        text: fileContent,
                    },
                    selections: [],
                    visibleRanges: [],
                },
            })

            CXP_CONTROLLER.registries.textDocumentDecoration
                .getDecorations({
                    textDocument: toTextDocumentIdentifier({
                        commitID,
                        filePath,
                        repoPath,
                    }),
                })
                .subscribe(decorations => {
                    for (const old of oldDecorations) {
                        old.dispose()
                    }
                    oldDecorations = []
                    for (const decoration of decorations || []) {
                        try {
                            oldDecorations.push(
                                applyDecoration({
                                    fileElement: files[0],
                                    decoration,
                                })
                            )
                        } catch (e) {
                            console.warn(e)
                        }
                    }
                })
        })
    }

    const mutationObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            const nodes = Array.prototype.slice.call(mutation.addedNodes)
            for (const node of nodes) {
                if (node && node.classList && node.classList.contains('file') && node.classList.contains('js-file')) {
                    const intersectionObserver = new IntersectionObserver(
                        entries => {
                            for (const file of entries) {
                                // File is an IntersectionObserverEntry, which has `isIntersecting` as a prop, but TS
                                // complains that it does not exist.
                                if ((file as any).isIntersecting && !file.target.classList.contains('annotated')) {
                                    file.target.classList.add('annotated')
                                    addBlobAnnotator(file.target as HTMLElement)
                                }
                            }
                        },
                        {
                            rootMargin: '200px',
                            threshold: 0,
                        }
                    )
                    intersectionObserver.observe(node)
                }
            }
        }
    })
    const filebucket = document.getElementById('files')
    if (!filebucket) {
        return
    }

    mutationObserver.observe(filebucket, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
    })
}

function injectBlobAnnotatorsOld(): void {
    const { repoPath, isDelta, isPullRequest, rev, isCommit, filePath, position } = parseURL()
    if (!filePath && !isDelta) {
        return
    }

    function addBlobAnnotator(file: HTMLElement): void {
        const getTableElement = () => file.querySelector('table')
        const diffLoader = file.querySelector('.js-diff-load-container')
        if (diffLoader) {
            const observer = new MutationObserver(() => {
                const element = diffLoader.querySelector('.diff-table')
                if (element) {
                    addBlobAnnotator(file)
                    observer.disconnect()
                }
            })
            observer.observe(diffLoader, { childList: true })
        }

        if (!isDelta) {
            const mount = createBlobAnnotatorMount(file)
            if (!mount) {
                return
            }

            const getCodeCellsCb = () => {
                const opt = { isDelta: false }
                const table = getTableElement()
                const cells: CodeCell[] = []
                if (!table) {
                    return cells
                }
                return getCodeCells(table, opt)
            }

            render(
                <WithResolvedRev
                    component={BlobAnnotator}
                    getTableElement={getTableElement}
                    getCodeCells={getCodeCellsCb}
                    getTargetLineAndOffset={getTargetLineAndOffset}
                    findElementWithOffset={findElementWithOffset}
                    findTokenCell={findTokenCell}
                    filterTarget={defaultFilterTarget}
                    getNodeToConvert={identity}
                    fileElement={file}
                    repoPath={repoPath}
                    rev={rev}
                    filePath={filePath}
                    isPullRequest={false}
                    isSplitDiff={false}
                    isCommit={false}
                    isBase={false}
                    buttonProps={buttonProps}
                    position={position}
                />,
                mount
            )

            return
        }

        const { headFilePath, baseFilePath } = getDeltaFileName(file)
        if (!headFilePath) {
            console.error('cannot determine file path')
            return
        }

        const isSplitDiff = isDomSplitDiff()
        let baseCommitID: string | undefined
        let headCommitID: string | undefined
        let baseRepoPath: string | undefined
        const deltaRevs = getDiffResolvedRev()
        if (!deltaRevs) {
            console.error('cannot determine deltaRevs')
            return
        }

        baseCommitID = deltaRevs.baseCommitID
        headCommitID = deltaRevs.headCommitID

        const deltaInfo = getDiffRepoRev()
        if (!deltaInfo) {
            console.error('cannot determine deltaInfo')
            return
        }

        baseRepoPath = deltaInfo.baseRepoPath

        const getCodeCellsDiff = (isBase: boolean) => () => {
            const opt = { isDelta: true, isSplitDiff, isBase }
            const table = getTableElement()
            const cells: CodeCell[] = []
            if (!table) {
                return cells
            }
            return getCodeCells(table, opt)
        }
        const getCodeCellsBase = getCodeCellsDiff(true)
        const getCodeCellsHead = getCodeCellsDiff(false)

        const filterTarget = (isBase: boolean, isSplitDiff: boolean) => (target: HTMLElement) => {
            const td = getTableDataCell(target)
            if (!td) {
                return false
            }

            if (isSplitDiff) {
                if (td.classList.contains('empty-cell')) {
                    return false
                }
                // Check the relative position of the <td> element to determine if it is
                // on the left or right.
                const previousEl = td.previousElementSibling
                const isLeft = previousEl === td.parentElement!.firstElementChild
                if (isBase) {
                    return isLeft
                } else {
                    return !isLeft
                }
            }

            if (td.classList.contains('blob-code-deletion') && !isBase) {
                return false
            }
            if (td.classList.contains('blob-code-deletion') && isBase) {
                return true
            }
            if (td.classList.contains('blob-code-addition') && isBase) {
                return false
            }
            if (td.classList.contains('blob-code-addition') && !isBase) {
                return true
            }
            if (isBase) {
                return false
            }
            return true
        }

        const getNodeToConvert = (td: HTMLTableDataCellElement) => {
            if (!td.classList.contains('blob-code-inner')) {
                return td.querySelector('.blob-code-inner') as HTMLElement
            }
            return td
        }

        const mountHead = createBlobAnnotatorMount(file)
        if (!mountHead) {
            return
        }

        render(
            <WithResolvedRev
                component={BlobAnnotator}
                getTableElement={getTableElement}
                getCodeCells={getCodeCellsHead}
                getTargetLineAndOffset={getTargetLineAndOffset}
                findElementWithOffset={findElementWithOffset}
                findTokenCell={findTokenCell}
                filterTarget={filterTarget(false, isSplitDiff)}
                getNodeToConvert={getNodeToConvert}
                fileElement={file}
                repoPath={baseRepoPath}
                rev={headCommitID}
                filePath={headFilePath}
                isPullRequest={isPullRequest}
                isDelta={isDelta}
                isSplitDiff={isSplitDiff}
                isCommit={isCommit}
                isBase={false}
                buttonProps={buttonProps}
            />,
            mountHead
        )

        const mountBase = createBlobAnnotatorMount(file, true)
        if (!mountBase) {
            return
        }

        render(
            <WithResolvedRev
                component={BlobAnnotator}
                getTableElement={getTableElement}
                getCodeCells={getCodeCellsBase}
                getTargetLineAndOffset={getTargetLineAndOffset}
                findElementWithOffset={findElementWithOffset}
                findTokenCell={findTokenCell}
                filterTarget={filterTarget(true, isSplitDiff)}
                getNodeToConvert={getNodeToConvert}
                fileElement={file}
                repoPath={baseRepoPath}
                rev={baseCommitID}
                filePath={baseFilePath || headFilePath}
                isPullRequest={isPullRequest}
                isDelta={isDelta}
                isSplitDiff={isSplitDiff}
                isCommit={isCommit}
                isBase={true}
                buttonProps={buttonProps}
            />,
            mountBase
        )
    }

    // Get first loaded files and annotate them.
    const files = getFileContainers()
    for (const file of Array.from(files)) {
        addBlobAnnotator(file as HTMLElement)
    }
    const mutationObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            const nodes = Array.prototype.slice.call(mutation.addedNodes)
            for (const node of nodes) {
                if (node && node.classList && node.classList.contains('file') && node.classList.contains('js-file')) {
                    const intersectionObserver = new IntersectionObserver(
                        entries => {
                            for (const file of entries) {
                                // File is an IntersectionObserverEntry, which has `isIntersecting` as a prop, but TS
                                // complains that it does not exist.
                                if ((file as any).isIntersecting && !file.target.classList.contains('annotated')) {
                                    file.target.classList.add('annotated')
                                    addBlobAnnotator(file.target as HTMLElement)
                                }
                            }
                        },
                        {
                            rootMargin: '200px',
                            threshold: 0,
                        }
                    )
                    intersectionObserver.observe(node)
                }
            }
        }
    })
    const filebucket = document.getElementById('files')
    if (!filebucket) {
        return
    }

    mutationObserver.observe(filebucket, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
    })
}

/**
 * Appends an Open on Sourcegraph button to the GitHub DOM.
 * The button is only rendered on a repo homepage after the "find file" button.
 */
function injectOpenOnSourcegraphButton(): void {
    const container = createOpenOnSourcegraphIfNotExists()
    const pageheadActions = document.querySelector('.pagehead-actions')
    if (!pageheadActions || !pageheadActions.children.length) {
        return
    }
    pageheadActions.insertBefore(container, pageheadActions.children[0])
    if (container) {
        const { repoPath, rev } = parseURL()
        if (repoPath) {
            render(
                <WithResolvedRev
                    component={ContextualSourcegraphButton}
                    repoPath={repoPath}
                    rev={rev}
                    defaultBranch={'HEAD'}
                    notFoundComponent={EnableSourcegraphServerButton}
                    requireAuthComponent={ServerAuthButton}
                />,
                container
            )
        }
    }
}

function injectMermaid(): void {
    if (!renderMermaidGraphsEnabled) {
        return
    }

    // The structure looks like:
    //
    //    ...
    //    <pre lang="mermaid">
    //       <code>
    //          graph TD;
    //             A-->B;
    //       </code>
    //    </pre>
    //   ...
    //
    // We want to end up with:
    //
    //    ...
    //    <pre lang="mermaid">
    //       <code>
    //          graph TD;
    //             A-->B;
    //       </code>
    //    </pre>
    //    <svg>
    //       /* SVG FROM MERMAID GOES HERE */
    //    </svg>
    //   ...

    let id = 1

    const renderMermaidCharts = () => {
        const pres = document.querySelectorAll('pre[lang=mermaid]')
        for (const pre of pres) {
            const el = pre as HTMLElement
            if (el.style.display === 'none') {
                // already rendered
                continue
            }
            el.style.display = 'none'
            const chartDefinition = pre.getElementsByTagName('code')[0].textContent || ''
            const chartID = `mermaid_${id++}`
            mermaid.mermaidAPI.render(chartID, chartDefinition, svg => el.insertAdjacentHTML('afterend', svg))
        }
    }

    // Render mermaid charts async and debounce the rendering
    // to minimize impact on page load.
    let timeout: number | undefined
    const handleDomChange = () => {
        clearTimeout(timeout)
        // Need to use window.setTimeout because:
        // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/21310#issuecomment-367919251
        timeout = window.setTimeout(() => renderMermaidCharts(), 100)
    }

    const observer = new MutationObserver(() => handleDomChange())
    observer.observe(document.body, { subtree: true, childList: true })
    handleDomChange()
}

function injectInlineSearch(): void {
    if (!inlineSymbolSearchEnabled) {
        return
    }

    // idempotently create a div to render the autocomplete react component inside of
    function createAutoCompleteContainerMount(textArea: HTMLTextAreaElement): HTMLDivElement | undefined {
        const parentDiv = textArea.parentElement
        if (!parentDiv) {
            return undefined
        }

        const className = 'symbols-autocomplete'

        const existingMount = parentDiv.querySelector(`.${className}`) as HTMLDivElement | null
        if (existingMount) {
            return existingMount
        }

        const mountElement = document.createElement('div')
        mountElement.className = className
        parentDiv.appendChild(mountElement)

        return mountElement
    }

    // lazily attach the symbols dropdown container whenever
    // a text area is focused
    document.addEventListener('focusin', e => {
        if (!e.target) {
            return
        }

        const target = e.target as HTMLElement

        if (target.tagName !== 'TEXTAREA') {
            return
        }

        const textArea = target as HTMLTextAreaElement
        const mountElement = createAutoCompleteContainerMount(textArea)
        if (mountElement) {
            render(<SymbolsDropdownContainer textBoxRef={textArea} />, mountElement)
        }
    })
}

const OPEN_ON_SOURCEGRAPH_ID = 'open-on-sourcegraph'

function createOpenOnSourcegraphIfNotExists(): HTMLElement {
    let container = document.getElementById(OPEN_ON_SOURCEGRAPH_ID)
    if (container) {
        container.remove()
    }

    container = document.createElement('li')
    container.id = OPEN_ON_SOURCEGRAPH_ID
    return container
}
