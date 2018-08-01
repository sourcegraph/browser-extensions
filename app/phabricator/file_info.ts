import { ContextResolver, HoveredToken, HoveredTokenContext } from '@sourcegraph/codeintellify'
import { from, Observable, zip } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
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
            }).pipe(map(({ commitID }) => ({ baseCommitID: commitID })))

            const resolveHeadCommitID = resolveDiffRev({
                repoPath: info.headRepoPath,
                differentialID: info.differentialID,
                diffID: info.diffID!,
                leftDiffID: info.leftDiffID,
                useDiffForBase: false,
                useBaseForDiff: false,
                filePath: info.filePath,
                isBase: false,
            }).pipe(map(({ commitID }) => ({ headCommitID: commitID })))

            return zip(resolveBaseCommitID, resolveHeadCommitID).pipe(
                map(([{ baseCommitID }, { headCommitID }]) => ({ baseCommitID, headCommitID, ...info }))
            )
        }),
        map(info => (token: HoveredToken): HoveredTokenContext => ({
            repoPath: token.part === 'base' ? info.baseRepoPath : info.headRepoPath,
            commitID: token.part === 'base' ? info.baseCommitID : info.headCommitID,
            filePath: token.part === 'base' ? info.baseFilePath || info.filePath : info.filePath,
            rev: token.part === 'base' ? info.baseRev : info.headRev,
        }))
    )
