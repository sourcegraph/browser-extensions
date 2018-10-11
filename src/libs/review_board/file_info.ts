import { merge, Observable } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'

import { resolveRepo } from '../../shared/repo/backend'
import { FileInfo } from '../code_intelligence'
import { normalizeRepoPath } from '../phabricator/util'
import { getState } from './state'
import { ReviewBoardRepository } from './state'

// Retry logic to find repo path on Sourcegraph. Not guaranteed to work with all
// ReviewBoard users.
function resolveRepoPathFromName(rbRepository: ReviewBoardRepository): Observable<string> {
    console.log(rbRepository)
    return merge(
        resolveRepo({ repoPath: rbRepository.name }),
        resolveRepo({ repoPath: normalizeRepoPath(rbRepository.path) })
    )
}

export const resolveFileInfo = (codeView: HTMLElement): Observable<FileInfo> =>
    getState().pipe(
        tap(a => {
            console.log(11111111, a)
        }),
        switchMap(state => resolveRepoPathFromName(state.repository).pipe(map(repoPath => ({ repoPath, state })))),
        map(({ repoPath }) => ({
            repoPath,
            filePath: 'asfsa',
            rev: 'master',
            commitID: 'jhgkklhkjlj',
        }))
    )

/**
 * Gets `FileInfo` for a diff file.
 */
// export const resolveDiffFileInfo = (codeView: HTMLElement): Observable<FileInfo> =>
//     of(undefined).pipe(
//         map(getDiffPageInfo),
//         // Resolve base commit ID.
//         switchMap(({ owner, repoName, mergeRequestID, diffID, baseCommitID, ...rest }) => {
//             const gettingBaseCommitID = baseCommitID
//                 ? // Commit was found in URL.
//                   of(baseCommitID)
//                 : // Commit needs to be fetched from the API.
//                   getBaseCommitIDForMergeRequest({ owner, repoName, mergeRequestID, diffID })

//             return gettingBaseCommitID.pipe(map(baseCommitID => ({ baseCommitID, baseRev: baseCommitID, ...rest })))
//         }),
//         map(info => {
//             // Head commit is found in the "View file @ ..." button in the code view.
//             const head = getHeadCommitIDFromCodeView(codeView)

//             return {
//                 ...info,

//                 rev: head,
//                 commitID: head,
//             }
//         }),
//         map(info => ({
//             ...info,
//             // Find both head and base file path if the name has changed.
//             ...getFilePathsFromCodeView(codeView),
//         })),
//         map(info => ({
//             ...info,

//             // https://github.com/sourcegraph/browser-extensions/issues/185
//             headHasFileContents: true,
//             baseHasFileContents: true,
//         })),
//         ensureRevisionsAreCloned
//     )
