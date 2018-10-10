import { propertyIsDefined } from '@sourcegraph/codeintellify/lib/helpers'
import { Observable, of, zip } from 'rxjs'
import { filter, map, switchMap } from 'rxjs/operators'
import { fetchBlobContentLines, resolveRev, retryWhenCloneInProgressError } from '../../shared/repo/backend'
import { FileInfo } from '../code_intelligence'
import { ensureRevisionsAreCloned } from '../code_intelligence/utils/file_info'
import { getDiffBaseRevision, getDiffFileInfo, getFileInfoFromCodeView } from './scrape'

/**
 * Resolves file information for a page with a single file, not including diffs with only one file.
 */
export const resolveFileInfo = (codeView: HTMLElement): Observable<FileInfo> =>
    of(codeView).pipe(
        map(getFileInfoFromCodeView),
        filter(propertyIsDefined('filePath')),
        switchMap(({ repoPath, rev, ...rest }) =>
            resolveRev({ repoPath, rev }).pipe(
                retryWhenCloneInProgressError(),
                map(commitID => ({ ...rest, repoPath, commitID, rev: rev || commitID }))
            )
        )
    )

export const resolveDiffFileInfo = (codeView: HTMLElement): Observable<FileInfo> =>
    of(codeView).pipe(
        map(getDiffFileInfo),
        map(info => ({
            ...info,
            baseRev: getDiffBaseRevision(),
        })),
        map(({ baseRev, ...rest }) => ({
            ...rest,
            baseCommitID: baseRev,
        })),
        filter(propertyIsDefined('filePath')),
        map(info => ({
            ...info,

            // https://github.com/sourcegraph/browser-extensions/issues/185
            headHasFileContents: true,
            baseHasFileContents: true,
        })),
        ensureRevisionsAreCloned,
        filter(propertyIsDefined('baseCommitID')),
        switchMap(info => {
            const fetchingBaseFile = fetchBlobContentLines({
                repoPath: info.baseRepoPath || info.repoPath,
                filePath: info.baseFilePath || info.filePath,
                commitID: info.baseCommitID,
                rev: info.baseRev,
            }).pipe(map(content => content.join('\n')))

            const fetchingHeadFile = fetchBlobContentLines({
                repoPath: info.repoPath,
                filePath: info.filePath,
                commitID: info.commitID,
                rev: info.rev,
            }).pipe(map(content => content.join('\n')))

            return zip(fetchingBaseFile, fetchingHeadFile).pipe(
                map(([baseFileContent, fileContent]) => ({ ...info, baseFileContent, fileContent }))
            )
        })
    )
