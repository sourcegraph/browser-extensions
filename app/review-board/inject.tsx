import {
    createHoverifier,
    findPositionsFromEvents,
    Hoverifier,
    HoverOverlay,
    HoverState,
    LinkComponent,
} from '@sourcegraph/codeintellify'
import { propertyIsDefined } from '@sourcegraph/codeintellify/lib/helpers'
import { HoverMerged } from '@sourcegraph/codeintellify/lib/types'
import * as React from 'react'
import { render } from 'react-dom'
import { merge, Observable, of, Subject } from 'rxjs'
import { filter, map, withLatestFrom } from 'rxjs/operators'
import { createJumpURLFetcher, lspViaAPIXlang } from '../backend/lsp'
import { CodeViewToolbar } from '../components/CodeViewToolbar'
import { AbsoluteRepoFilePosition } from '../repo'
import { resolveRepo, resolveRev } from '../repo/backend'
import { normalizeRepoPath } from '../repo/index'
import { eventLogger, sourcegraphUrl } from '../util/context'
import { getRepositoryFromReviewBoardAPI } from './backend/fetch'
import { createBlobAnnotatorMount, diffDomFunctions, getDeltaFileName } from './dom/util'
import {
    configureReviewBoardHandlers,
    REVIEW_BOARD_LOADED_EVENT_ID,
    ReviewBoardRepository,
    ReviewBoardState,
} from './util'

let reviewBoardState: ReviewBoardState | undefined

const buttonProps = {
    className: 'btn btn-sm tooltipped tooltipped-n',
    style: { marginRight: '5px', textDecoration: 'none', color: 'inherit' },
}

export function injectReviewboardApplication(): void {
    injectReviewBoard()
}

function injectReviewBoard(): void {
    if (!reviewBoardState) {
        configureReviewBoardHandlers()
        return
    }
    injectAnnotators()
}

function resolveRepoPathFromName(rbRepository: ReviewBoardRepository): Observable<string> {
    return merge(
        resolveRepo({ repoPath: rbRepository.name }),
        resolveRepo({ repoPath: normalizeRepoPath(rbRepository.path) })
    )
}

function injectAnnotators(): void {
    if (!reviewBoardState) {
        return
    }
    const { repository, reviewRequest } = reviewBoardState
    getRepositoryFromReviewBoardAPI(repository.id).subscribe(rbRepository => {
        resolveRepoPathFromName(rbRepository).subscribe(
            repoName => {
                const baseCommitID = reviewRequest.branch
                resolveRev({ repoPath: repoName, rev: baseCommitID }).subscribe(rev => {
                    const { hoverifier } = createCodeIntelligenceContainer(sourcegraphUrl)
                    function addBlobAnnotator(file: HTMLElement): void {
                        const { headFilePath, baseFilePath } = getDeltaFileName(file)
                        const baseCommitID = rev
                        let headCommitID = reviewRequest.extraData.local_branch
                        const commitField = document.getElementById('field_commit_id') as HTMLSpanElement
                        if (commitField && commitField.firstElementChild) {
                            headCommitID = (commitField.firstElementChild as HTMLSpanElement).title
                        }
                        hoverifier.hoverify({
                            dom: diffDomFunctions,
                            positionEvents: of(file).pipe(findPositionsFromEvents(diffDomFunctions)),
                            resolveContext: ({ part }) => ({
                                repoPath: repoName,
                                rev: part === 'base' ? baseCommitID : headCommitID,
                                commitID: part === 'base' ? baseCommitID : headCommitID,
                                // If a hover happened on the base, it must exist
                                filePath: part === 'base' ? baseFilePath! : headFilePath,
                            }),
                        })
                        const mount = createBlobAnnotatorMount(file, true)
                        render(
                            <CodeViewToolbar
                                repoPath={repoName}
                                filePath={headFilePath}
                                baseCommitID={baseCommitID}
                                headCommitID={headCommitID}
                                buttonProps={buttonProps}
                                simpleCXPFns={lspViaAPIXlang}
                            />,
                            mount
                        )
                    }
                    const files = document.querySelectorAll('.diff-box')
                    for (const file of Array.from(files)) {
                        addBlobAnnotator(file as HTMLElement)
                    }
                })
            },
            err => console.error(err)
        )
    })
}

document.addEventListener(REVIEW_BOARD_LOADED_EVENT_ID, (e: CustomEvent) => {
    reviewBoardState = e.detail
    injectReviewBoard()
})

function createCodeIntelligenceContainer(baseUrl: string): { hoverifier: Hoverifier } {
    /** Emits when the go to definition button was clicked */
    const goToDefinitionClicks = new Subject<MouseEvent>()
    const nextGoToDefinitionClick = (event: MouseEvent) => goToDefinitionClicks.next(event)

    /** Emits when the close button was clicked */
    const closeButtonClicks = new Subject<MouseEvent>()
    const nextCloseButtonClick = (event: MouseEvent) => closeButtonClicks.next(event)

    /** Emits whenever the ref callback for the hover element is called */
    const hoverOverlayElements = new Subject<HTMLElement | null>()
    const nextOverlayElement = (element: HTMLElement | null) => hoverOverlayElements.next(element)

    const overlayMount = document.createElement('div')
    overlayMount.style.height = '0px'
    document.body.appendChild(overlayMount)
    const relativeElement = document.body

    const fetchJumpURL = createJumpURLFetcher(lspViaAPIXlang.fetchDefinition, (def: AbsoluteRepoFilePosition) => {
        const rev = def.commitID || def.rev
        const url = baseUrl.endsWith('/') ? baseUrl.substring(baseUrl.length - 1) : baseUrl
        return `${url}/${def.repoPath}@${rev || 'HEAD'}/-/blob/${def.filePath}#L${def.position.line}${
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
            lspViaAPIXlang
                .fetchHover({ ...rest, position: { line, character } })
                .pipe(map(hover => (hover ? (hover as HoverMerged) : hover))),
        fetchJumpURL,
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

    return { hoverifier }
}

const LinkComponent: LinkComponent = ({ to, children, ...rest }) => (
    <a href={new URL(to, sourcegraphUrl).href} {...rest}>
        {children}
    </a>
)
