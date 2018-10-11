import { EMPTY, fromEvent, merge, Observable, of } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'

const REVIEW_BOARD_STATE_ID = 'REVIEW_BOARD_STATE_ID'
export const REVIEW_BOARD_LOADED_EVENT_ID = 'REVIEW_BOARD_LOADED'

interface ReviewBoardStateHandler {
    reviewRequest?: {
        attributes: {
            repository: any
        } & ReviewBoardReview
    }
}

export interface ReviewBoardState {
    repository: ReviewBoardRepository
    reviewRequest: ReviewBoardReview
}

export interface ReviewBoardRepository {
    id: number
    cid: number
    attributes: ReviewBoardRepositoryAttributes
    mirror_path: string
    name: string
    path: string
    tool: string
    visible: boolean
}

export interface ReviewBoardReview {
    approved: boolean
    branch: string
    commitID: string
    extraData: {
        local_branch: string
    }
    id: number
    lastUpdated: string
    localSitePrefix: string
    public: boolean
    repository: ReviewBoardRepository
    reviewURL: string
    state: number
}

interface ReviewBoardRepositoryAttributes {
    filesOnly: boolean
    id: number
    loaded: boolean
    localSitePrefix: string
    name: string
    requiresBaseDir: boolean
    requiresChangeNumber: boolean
    scmtoolName: string
    supportsPostCommit: boolean
}
export function configureReviewBoardHandlers(): void {
    reviewBoardPierce(getReviewboardStateHandler, REVIEW_BOARD_STATE_ID)
}

export const getState = (): Observable<ReviewBoardState> =>
    of(undefined).pipe(
        switchMap(() => {
            // Set up an event listener
            const listen = fromEvent<CustomEvent<ReviewBoardState>>(document, REVIEW_BOARD_LOADED_EVENT_ID)
            const emit = of(undefined).pipe(
                tap(() => {
                    reviewBoardPierce(getReviewboardStateHandler, REVIEW_BOARD_STATE_ID)
                }),
                switchMap(() => EMPTY)
            )

            return merge(listen, emit)
        }),
        map(({ detail }) => detail)
    )

function getReviewboardStateHandler(): void {
    const page = (window as any).RB.PageManager.getPage() as ReviewBoardStateHandler
    let reviewRequest = {}
    if (page.reviewRequest) {
        const {
            approved,
            branch,
            commitID,
            extraData,
            id,
            lastUpdated,
            localSitePrefix,
            repository,
            reviewURL,
            state,
        } = page.reviewRequest.attributes

        reviewRequest = {
            approved,
            branch,
            commitID,
            extraData,
            id,
            lastUpdated,
            localSitePrefix,
            repository,
            reviewURL,
            state,
        }
    }

    console.log('!!!!!!!!!!!', page)

    document.dispatchEvent(
        new CustomEvent('REVIEW_BOARD_LOADED', {
            detail: {
                repository: page.reviewRequest!.attributes.repository,
                reviewRequest,
            } as ReviewBoardState,
        })
    )
}

/**
 * This injects code as a script tag into a web page body.
 * Needed to reference the Review Board Internal RB code.
 */
function reviewBoardPierce(code: () => void, id: string): void {
    let s = document.getElementById(id) as HTMLScriptElement
    if (s) {
        return
    }
    s = document.createElement('script') as HTMLScriptElement
    s.id = id
    s.setAttribute('type', 'text/javascript')
    s.textContent = code.toString() + ';' + code.name + '();'
    document.body.appendChild(s)
}
