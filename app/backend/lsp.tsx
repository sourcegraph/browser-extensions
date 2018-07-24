import { DiffPart, JumpURLFetcher } from '@sourcegraph/codeintellify'
import { isErrorLike } from '@sourcegraph/codeintellify/lib/errors'
import { InitializeResult } from 'cxp/lib/protocol'
import { HoverMerged } from 'cxp/lib/types/hover'
import { Observable, of } from 'rxjs'
import { ajax, AjaxResponse } from 'rxjs/ajax'
import { catchError, map, tap } from 'rxjs/operators'
import { Definition, TextDocumentIdentifier } from 'vscode-languageserver-types'
import { ServerCapabilities, TextDocumentPositionParams } from 'vscode-languageserver/lib/main'
import { AbsoluteRepoFile, AbsoluteRepoFilePosition, AbsoluteRepoLanguageFile, parseRepoURI } from '../repo'
import {
    getModeFromPath,
    isPrivateRepository,
    repoUrlCache,
    sourcegraphUrl,
    supportedModes,
    useCXP,
} from '../util/context'
import { memoizeObservable } from '../util/memoize'
import { toAbsoluteBlobURL } from '../util/url'
import { CXP_CONTROLLER } from './cxp'
import { normalizeAjaxError } from './errors'
import { getHeaders } from './headers'

export interface LSPRequest {
    method: string
    params: any
}

/** LSP proxy error code for unsupported modes */
export const EMODENOTFOUND = -32000

export function isEmptyHover(hover: HoverMerged | null): boolean {
    return !hover || !hover.contents || (Array.isArray(hover.contents) && hover.contents.length === 0)
}

type ResponseMessages = { 0: { result: InitializeResult } } & any[]

function wrapLSP(reqs: LSPRequest[], ctx: AbsoluteRepoFile): any[] {
    const modeFromPath = getModeFromPath(ctx.filePath)
    const mode = modeFromPath && supportedModes.has(modeFromPath) ? modeFromPath : undefined
    if (!mode) {
        throw new Error('Unsupported mode ' + modeFromPath + ' for file ' + ctx.filePath)
    }

    return [
        {
            method: 'initialize',
            params: {
                rootUri: `git://${ctx.repoPath}?${ctx.commitID}`,
                initializationOptions: { mode },
            },
        },
        ...reqs,
        { method: 'shutdown' },
        { method: 'exit' },
    ].map((obj, id) => (obj.method !== 'exit' ? { ...obj, id } : obj))
}

const sendLSPRequest = (method: string, params: any, ctx: AbsoluteRepoFile): Observable<any> => {
    const url = repoUrlCache[ctx.repoPath] || sourcegraphUrl

    const body = wrapLSP([{ method, params }], ctx)

    if (isErrorLike(body)) {
        throw body
    }
    if (!canFetchForURL(url)) {
        return of(null)
    }

    return ajax({
        method: 'POST',
        url: `${url}/.api/xlang/${method}`,
        headers: getHeaders(),
        crossDomain: true,
        withCredentials: true,
        body: JSON.stringify(body),
        async: true,
    }).pipe(
        // Workaround for https://github.com/ReactiveX/rxjs/issues/3606
        tap(response => {
            if (response.status === 0) {
                throw Object.assign(new Error('Ajax status 0'), response)
            }
        }),
        catchError<AjaxResponse, never>(err => {
            normalizeAjaxError(err)
            throw err
        }),
        map(({ response }) => response),
        map((results: ResponseMessages) => {
            for (const result of results) {
                if (result && result.error) {
                    throw Object.assign(new Error(result.error.message), result.error, { responses: results })
                }
            }

            return results[1] && (results[1].result as any)
        })
    )
}

export const toTextDocumentIdentifier = (pos: AbsoluteRepoFile): TextDocumentIdentifier => ({
    uri: `git://${pos.repoPath}?${pos.commitID}#${pos.filePath}`,
})

const toTextDocumentPositionParams = (pos: AbsoluteRepoFilePosition): TextDocumentPositionParams => ({
    textDocument: toTextDocumentIdentifier(pos),
    position: {
        character: pos.position.character! - 1,
        line: pos.position.line - 1,
    },
})

export const fetchHover = (pos: AbsoluteRepoFilePosition): Observable<HoverMerged | null> =>
    (useCXP
        ? arg =>
              CXP_CONTROLLER.registries.textDocumentHover
                  .getHover(toTextDocumentPositionParams(arg))
                  .pipe(map(hover => (hover === null ? HoverMerged.from([]) : hover)))
        : memoizeObservable((ctx: AbsoluteRepoFilePosition) =>
              sendLSPRequest('textDocument/hover', toTextDocumentPositionParams(ctx), ctx)
          ))(pos)

export const fetchDefinition = (pos: AbsoluteRepoFilePosition): Observable<Definition> =>
    (useCXP
        ? arg => CXP_CONTROLLER.registries.textDocumentDefinition.getLocation(toTextDocumentPositionParams(arg))
        : memoizeObservable<AbsoluteRepoFilePosition, Definition>((ctx: AbsoluteRepoFilePosition) =>
              sendLSPRequest('textDocument/definition', toTextDocumentPositionParams(ctx), ctx).pipe(
                  map(definition => definition as any)
              )
          ))(pos)

export function fetchJumpURL(pos: AbsoluteRepoFilePosition): Observable<string | null> {
    return fetchDefinition(pos).pipe(
        map(def => {
            const defArray = Array.isArray(def) ? def : [def]
            def = defArray[0]
            if (!def) {
                return null
            }

            const uri = parseRepoURI(def.uri) as AbsoluteRepoFilePosition
            uri.position = { line: def.range.start.line + 1, character: def.range.start.character + 1 }
            return toAbsoluteBlobURL(uri)
        })
    )
}

export type JumpURLLocation = AbsoluteRepoFilePosition & { rev: string } & { part?: DiffPart }
export function createJumpURLFetcher(buildURL: (pos: JumpURLLocation) => string): JumpURLFetcher {
    return ({ line, character, part, commitID, repoPath, ...rest }) =>
        fetchDefinition({ ...rest, commitID, repoPath, position: { line, character } }).pipe(
            map(def => {
                const defArray = Array.isArray(def) ? def : [def]
                def = defArray[0]
                if (!def) {
                    return null
                }

                const uri = parseRepoURI(def.uri)
                return buildURL({
                    repoPath: uri.repoPath,
                    commitID: uri.commitID!, // LSP proxy always includes a commitID in the URI.
                    rev: uri.repoPath === repoPath && uri.commitID === commitID ? rest.rev : uri.rev!, // If the commitID is the same, keep the rev.
                    filePath: uri.filePath!, // There's never going to be a definition without a file.
                    position: {
                        line: def.range.start.line + 1,
                        character: def.range.start.character + 1,
                    },
                    part,
                })
            })
        )
}

/**
 * Modes that are known to not be supported because the server replied with a mode not found error
 */
const unsupportedModes = new Set<string>()

export const fetchServerCapabilities = (pos: AbsoluteRepoLanguageFile): Observable<ServerCapabilities | undefined> => {
    // We're only interested in the InitializeResult, so we don't pass any requests.
    const body = wrapLSP([], pos)
    const url = repoUrlCache[pos.repoPath] || sourcegraphUrl
    if (!canFetchForURL(url)) {
        return of(undefined)
    }
    return ajax({
        method: 'POST',
        url: `${url}/.api/xlang/initialize`,
        headers: getHeaders(),
        crossDomain: true,
        withCredentials: true,
        body: JSON.stringify(body),
        async: true,
    }).pipe(
        tap(response => {
            if (response.status === 0) {
                throw Object.assign(new Error('Ajax status 0'), response)
            }
        }),
        catchError<AjaxResponse, never>(err => {
            normalizeAjaxError(err)
            throw err
        }),
        map(({ response }) => response),
        map(results => {
            for (const result of results) {
                if (result && result.error) {
                    if (result.error.code === EMODENOTFOUND) {
                        unsupportedModes.add(pos.language)
                    }
                    throw Object.assign(new Error(result.error.message), result.error)
                }
            }

            return results.map((result: any) => result && result.result)
        }),
        map(results => (results[0] as InitializeResult).capabilities)
    )
}

function canFetchForURL(url: string): boolean {
    if (url === 'https://sourcegraph.com' && isPrivateRepository()) {
        return false
    }
    return true
}
