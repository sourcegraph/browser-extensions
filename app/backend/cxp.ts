import {
    createController as createCXPController,
    CXPExtensionWithManifest,
} from '@sourcegraph/extensions-client-common/lib/cxp/controller'
import { ConfiguredExtension } from '@sourcegraph/extensions-client-common/lib/extensions/extension'
import { ClientOptions } from 'cxp/module/client/client'
import { Environment } from 'cxp/module/environment/environment'
import { Extension } from 'cxp/module/environment/extension'
import { MessageTransports } from 'cxp/module/jsonrpc2/connection'
import { createWebSocketMessageTransports } from 'cxp/module/jsonrpc2/transports/browserWebSocket'
import { TextDocumentDecoration } from 'cxp/module/protocol'
import { combineLatest, from, ReplaySubject } from 'rxjs'
import { filter, map, take, withLatestFrom } from 'rxjs/operators'
import uuid from 'uuid'
import { Disposable } from 'vscode-languageserver'
import storage from '../../extension/storage'
import { useCXP } from '../util/context'
import { isErrorLike } from './errors'
import { createExtensionsContextController } from './extensions'
import { createPortMessageTransports } from './PortMessageTransports'

// TODO(chris) create the controllers in an inject function rather than at the
// top-level
export const CXP_EXTENSIONS_CONTEXT_CONTROLLER = createExtensionsContextController()
export const CXP_CONTROLLER = createCXPController(CXP_EXTENSIONS_CONTEXT_CONTROLLER.context, createMessageTransports)

export const rootAndComponent = new ReplaySubject<Pick<Environment<Extension>, 'root' | 'component'>>(1)

export const configuredExtensionToCXPExtensionWithManifest = (x: ConfiguredExtension) => ({
    id: x.extensionID,
    settings: { merged: x.settings },
    isEnabled: x.isEnabled,
    manifest: x.manifest,
})

const when = f => observable =>
    observable.pipe(
        withLatestFrom(f),
        filter(([_, v]) => v),
        map(([x, _]) => x)
    )

combineLatest(CXP_EXTENSIONS_CONTEXT_CONTROLLER.viewerConfiguredExtensions, rootAndComponent)
    .pipe(when(useCXP))
    .subscribe(
        ([configuredExtensions, rootAndComponent]) => {
            CXP_CONTROLLER.setEnvironment({
                ...rootAndComponent,
                extensions: configuredExtensions.map(configuredExtensionToCXPExtensionWithManifest),
            })
        },
        err => {
            console.error('Error fetching viewer configured extensions via GraphQL: %O', err)
        }
    )

const createPlatformMessageTransports = ({ platform }) =>
    new Promise<MessageTransports>((resolve, reject) => {
        const channelID = uuid.v4()
        const port = chrome.runtime.connect({ name: channelID })
        port.postMessage({ platform })
        const cb = (response: { error?: any }) => {
            port.onMessage.removeListener(cb)
            if (response.error) {
                reject(response.error)
            } else {
                resolve(createPortMessageTransports(port))
            }
        }
        port.onMessage.addListener(cb)
    })

export function createMessageTransports(
    extension: CXPExtensionWithManifest,
    options: ClientOptions
): Promise<MessageTransports> {
    if (!extension.manifest) {
        throw new Error(`unable to connect to extension ${JSON.stringify(extension.id)}: no manifest found`)
    }
    if (isErrorLike(extension.manifest)) {
        throw new Error(
            `unable to connect to extension ${JSON.stringify(extension.id)}: invalid manifest: ${
                extension.manifest.message
            }`
        )
    }
    if (extension.manifest.platform.type === 'websocket') {
        return createPlatformMessageTransports({ platform: extension.manifest.platform })
    } else if (extension.manifest.platform.type === 'tcp') {
        // The language server CXP extensions on Sourcegraph are specified as
        // TCP endpoints, but they are also served over WebSockets by lsp-proxy
        // on the Sourcegraph instance. Since we can't connect to a TCP endpoint
        // in the browser, we connect to lsp-proxy via WebSockets instead.
        //
        // TODO(chris): Remove this logic if/when platform-rewriting lands
        // https://github.com/sourcegraph/sourcegraph/issues/12598
        return from(storage.observeSync('sourcegraphURL'))
            .pipe(take(1))
            .toPromise()
            .then(urlString => {
                const url = new URL(urlString)
                url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
                url.pathname = '.api/lsp'
                url.searchParams.set('mode', extension.id)
                url.searchParams.set('rootUri', options.root || '')
                return createWebSocketMessageTransports(new WebSocket(url.href))
            })
    } else if (extension.manifest.platform.type === 'bundle') {
        return createPlatformMessageTransports({ platform: extension.manifest.platform })
    } else {
        return Promise.reject(
            new Error(
                `Unable to connect to CXP extension ${JSON.stringify(extension.id)}: type ${JSON.stringify(
                    extension.manifest.platform.type
                )} is not supported`
            )
        )
    }
}

const mergeDisposables = (...disposables: Disposable[]): Disposable => ({
    dispose: () => {
        for (const disposable of disposables) {
            disposable.dispose()
        }
    },
})

// This applies a decoration to a GitHub blob page. This doesn't work with any other code host yet.
export const applyDecoration = ({
    fileElement,
    decoration,
}: {
    fileElement: HTMLElement
    decoration: TextDocumentDecoration
}): Disposable => {
    const disposables: Disposable[] = []

    const ghLineNumber = decoration.range.start.line + 1
    const lineNumberElements: NodeListOf<HTMLElement> = fileElement.querySelectorAll(
        `td[data-line-number="${ghLineNumber}"]`
    )
    if (!lineNumberElements) {
        throw new Error(`Line number ${ghLineNumber} not found`)
    }
    if (lineNumberElements.length !== 1) {
        throw new Error(`Line number ${ghLineNumber} matched ${lineNumberElements.length} elements (expected 1)`)
    }
    const lineNumberElement = lineNumberElements[0]
    if (!lineNumberElement) {
        throw new Error(`Line number ${ghLineNumber} is falsy: ${lineNumberElement}`)
    }
    const lineElement = lineNumberElement.nextElementSibling as HTMLElement | undefined
    if (!lineElement) {
        throw new Error(`Line ${ghLineNumber} is falsy: ${lineNumberElement}`)
    }

    if (decoration.backgroundColor) {
        lineElement.style.backgroundColor = decoration.backgroundColor

        disposables.push({
            dispose: () => {
                lineElement.style.backgroundColor = null
            },
        })
    }

    if (decoration.after) {
        const linkTo = (url: string) => (e: HTMLElement): HTMLElement => {
            const link = document.createElement('a')
            link.setAttribute('href', url)
            link.style.color = decoration.after!.color || null
            link.appendChild(e)
            return link
        }
        const after = document.createElement('span')
        after.style.backgroundColor = decoration.after.backgroundColor || null
        after.textContent = decoration.after.contentText || null
        const annotation = decoration.after.linkURL ? linkTo(decoration.after.linkURL)(after) : after
        lineElement.appendChild(annotation)
        disposables.push({
            dispose: () => {
                annotation.remove()
            },
        })
    }

    return mergeDisposables(...disposables)
}
