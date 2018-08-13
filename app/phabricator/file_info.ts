import { ContextResolver, HoveredToken, HoveredTokenContext } from '@sourcegraph/codeintellify'
import { from, Observable, zip } from 'rxjs'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { DifferentialState, PhabricatorMode } from '.'
import { resolveDiffRev } from './backend'
import { getFilepathFromFile, getPhabricatorState } from './util'

export const createDifferentialContextResolver = (codeView: HTMLElement): Observable<ContextResolver> =>
    from(getPhabricatorState(window.location)).pipe(
        filter(state => state !== null && state.mode === PhabricatorMode.Differential),
        map(state => state as DifferentialState),
        map(state => {
            const { filePath, baseFilePath } = getFilepathFromFile(codeView)

            return {
                ...state,
                filePath,
                baseFilePath,
            }
        }),
        switchMap(info => {
            const resolveBaseCommitID = resolveDiffRev({
                repoPath: info.baseRepoPath,
                differentialID: info.differentialID,
                diffID: (info.leftDiffID || info.diffID)!,
                leftDiffID: info.leftDiffID,
                useDiffForBase: Boolean(info.leftDiffID), // if ?vs and base is not `on` i.e. the initial commit)
                useBaseForDiff: false,
                filePath: info.baseFilePath || info.filePath,
                isBase: true,
            }).pipe(
                map(({ commitID, stagingRepoPath }) => ({
                    baseCommitID: commitID,
                    baseRepoPath: stagingRepoPath || info.baseRepoPath,
                })),
                catchError(err => {
                    throw err
                })
            )

            const resolveHeadCommitID = resolveDiffRev({
                repoPath: info.headRepoPath,
                differentialID: info.differentialID,
                diffID: info.diffID!,
                leftDiffID: info.leftDiffID,
                useDiffForBase: false,
                useBaseForDiff: false,
                filePath: info.filePath,
                isBase: false,
            }).pipe(
                map(({ commitID, stagingRepoPath }) => ({
                    headCommitID: commitID,
                    headRepoPath: stagingRepoPath || info.headRepoPath,
                })),
                catchError(err => {
                    throw err
                })
            )

            return zip(resolveBaseCommitID, resolveHeadCommitID).pipe(
                map(([{ baseCommitID, baseRepoPath }, { headCommitID, headRepoPath }]) => ({
                    baseCommitID,
                    headCommitID,
                    ...info,
                    baseRepoPath,
                    headRepoPath,
                }))
            )
        }),
        map(info => (token: HoveredToken): HoveredTokenContext => ({
            repoPath: token.part === 'base' ? info.baseRepoPath : info.headRepoPath,
            commitID: token.part === 'base' ? info.baseCommitID : info.headCommitID,
            filePath: token.part === 'base' ? info.baseFilePath || info.filePath : info.filePath,
            rev: token.part === 'base' ? info.baseRev : info.headRev,
        }))
    )
