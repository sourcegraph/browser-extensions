import { ContextResolver, HoveredToken, HoveredTokenContext } from '@sourcegraph/codeintellify'
import { from, Observable, of } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { DifferentialState, PhabricatorMode } from '.'
import { AbsoluteRepoFile, RevSpec } from '../repo'
import { getFilepathFromFile, getPhabricatorState } from './util'

export const getDifferentialRevSpe1 = (): Observable<AbsoluteRepoFile & RevSpec> =>
    of({
        repoPath: '',
        commitID: '',
        filePath: '',
        rev: '',
    })

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
                baseCommitID: '',
                headCommitID: '',
            }
        }),
        map(info => (token: HoveredToken): HoveredTokenContext => ({
            repoPath: token.part === 'base' ? info.baseRepoPath : info.headRepoPath,
            commitID: token.part === 'base' ? info.baseCommitID : info.headCommitID,
            filePath: token.part === 'base' ? info.baseFilePath || info.filePath : info.filePath,
            rev: token.part === 'base' ? info.baseRev : info.headRev,
        }))
    )
