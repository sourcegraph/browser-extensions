import {
    ContextResolver,
    createHoverifier,
    DiffPart,
    DOMFunctions,
    findPositionsFromEvents,
    Hoverifier,
    HoverOverlay,
    HoverState,
    LinkComponent,
} from '@sourcegraph/codeintellify'
import { propertyIsDefined } from '@sourcegraph/codeintellify/lib/helpers'
import { HoverMerged } from '@sourcegraph/codeintellify/lib/types'
import { toPrettyBlobURL } from '@sourcegraph/codeintellify/lib/url'
import * as React from 'react'
import { render } from 'react-dom'
import { Observable, of, Subject, Subscription } from 'rxjs'
import { filter, map, withLatestFrom } from 'rxjs/operators'

import { createJumpURLFetcher } from '../backend/lsp'
import { fetchHover } from '../backend/lsp'
import { eventLogger, sourcegraphUrl } from '../util/context'

function createCodeIntelligenceContainer(options?: { repoPath: string }): { hoverifier: Hoverifier } {
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

    const fetchJumpURL = createJumpURLFetcher(toPrettyBlobURL)

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
    })

    const Link: LinkComponent = ({ to, children, ...rest }) => (
        <a href={new URL(to, sourcegraphUrl).href} {...rest}>
            {children}
        </a>
    )

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
                    linkComponent={Link}
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

export interface CodeViewInfo {
    selector: string
    dom: DOMFunctions
    getToolbarMount: (codeView: HTMLElement, part?: DiffPart) => HTMLElement
    createContextResolver(codeView: HTMLElement): Observable<ContextResolver>
    adjustPositions?: (codeView: HTMLElement, position: Position) => Position
}

export interface CodeView extends CodeViewInfo {
    codeView: HTMLElement
}

function findCodeViews(codeViewInfos: CodeViewInfo[]): Observable<CodeView> {
    return new Observable<CodeView>(observer => {
        console.log(codeViewInfos)
        for (const info of codeViewInfos) {
            const elements = document.querySelectorAll<HTMLElement>(info.selector)
            for (const codeView of elements) {
                observer.next({ ...info, codeView })
            }
        }
    })
}

export function injectCodeIntelligence(codeViewInfos: CodeViewInfo[]): Subscription {
    const { hoverifier } = createCodeIntelligenceContainer()

    return findCodeViews(codeViewInfos).subscribe(({ codeView, dom, createContextResolver }) =>
        createContextResolver(codeView).subscribe(resolveContext =>
            hoverifier.hoverify({
                dom,
                positionEvents: of(codeView).pipe(findPositionsFromEvents(dom)),
                resolveContext,
            })
        )
    )
}
