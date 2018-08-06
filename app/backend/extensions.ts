import { Controller as ExtensionsContextController } from '@sourcegraph/extensions-client-common/lib/controller'
import { Settings } from '@sourcegraph/extensions-client-common/lib/copypasta'
import { gql, graphQLContent } from '@sourcegraph/extensions-client-common/lib/graphql'
import {
    ConfigurationCascade,
    ConfigurationSubject,
    gqlToCascade,
} from '@sourcegraph/extensions-client-common/lib/settings'
import Loader from '@sourcegraph/icons/lib/Loader'
import Warning from '@sourcegraph/icons/lib/Warning'
import * as JSONC from '@sqs/jsonc-parser'
import { applyEdits } from '@sqs/jsonc-parser'
import { removeProperty, setProperty } from '@sqs/jsonc-parser/lib/edit'
import deepmerge from 'deepmerge'
import { flatten, isEqual } from 'lodash'
import { combineLatest, Observable, ReplaySubject, Subject, throwError } from 'rxjs'
import { distinctUntilChanged, map, mergeMap, switchMap, take } from 'rxjs/operators'
import storage from '../../extension/storage'
import { sourcegraphURLSubject } from '../util/context'
import { getContext } from './context'
import { createAggregateError } from './errors'
import { queryGraphQL } from './graphql'

// TODO clicking on an extension on the options page needs to take you to your Sourcegraph instance's registry. Right now it takes you nowhere.

const mysub: ConfigurationSubject = {
    // TODO fill in legit values
    id: 'Client',
    settingsURL: 'foo',
    viewerCanAdminister: true,
    __typename: 'Client',
    displayName: 'me',
}

export const clientSettingsUpdates: Observable<string> = (() => {
    const update = new ReplaySubject<string>(1)
    storage.getSync(storageItems => update.next(storageItems.clientSettings))
    storage.onChanged(changes => {
        if (changes.clientSettings) {
            update.next(changes.clientSettings.newValue)
        }
    })
    return update
})()

const storageConfigurationCascade: Observable<
    ConfigurationCascade<ConfigurationSubject, Settings>
> = clientSettingsUpdates.pipe(
    map(clientSettingsString => JSONC.parse(clientSettingsString)),
    map(clientSettings => ({
        subjects: [
            {
                subject: mysub,
                settings: clientSettings,
            },
        ],
        merged: clientSettings,
    }))
)

const mergeCascades: (
    ...cascades: ConfigurationCascade<ConfigurationSubject, Settings>[]
) => ConfigurationCascade<ConfigurationSubject, Settings> = (...cascades) => ({
    subjects: flatten(cascades.map(cascade => cascade.subjects)),
    merged: cascades.map(cascade => cascade.merged).reduce((acc, obj) => deepmerge(acc, obj), {}),
})

// copy pasta from web/src/user/settings/backend.tsx

const configurationCascadeFragment = gql`
    fragment ConfigurationCascadeFields on ConfigurationCascade {
        defaults {
            contents
        }
        subjects {
            __typename
            ... on Org {
                id
                name
                displayName
            }
            ... on User {
                id
                username
                displayName
            }
            ... on Site {
                id
                siteID
            }
            latestSettings {
                id
                configuration {
                    contents
                }
            }
            settingsURL
            viewerCanAdminister
        }
        merged {
            contents
            messages
        }
    }
`

// copy pasta from web/src/settings/configuration.ts

/**
 * Always represents the entire configuration cascade; i.e., it contains the
 * individual configs from the various config subjects (orgs, user, etc.).
 */
export const gqlConfigurationCascade = new ReplaySubject<GQL.IConfigurationCascade>(1)
sourcegraphURLSubject
    .pipe(
        switchMap(url =>
            queryGraphQL(
                getContext({ repoKey: '', isRepoSpecific: false }),
                gql`
                    query Configuration {
                        viewerConfiguration {
                            ...ConfigurationCascadeFields
                        }
                    }
                    ${configurationCascadeFragment}
                `[graphQLContent],
                {},
                [url]
            ).pipe(
                map(({ data, errors }) => {
                    if (!data || !data.viewerConfiguration) {
                        throw createAggregateError(errors)
                    }
                    return data.viewerConfiguration
                })
            )
        )
    )
    .subscribe(cascade => gqlConfigurationCascade.next(cascade))

export function createExtensionsContextController(): ExtensionsContextController<ConfigurationSubject> {
    return new ExtensionsContextController<ConfigurationSubject>({
        configurationCascade: combineLatest(gqlConfigurationCascade, storageConfigurationCascade).pipe(
            map(([gqlCascade, storageCascade]) => mergeCascades(gqlToCascade(gqlCascade), storageCascade)),
            distinctUntilChanged((a, b) => isEqual(a, b))
        ),
        // TODO(chris) figure out what happens when this fails. A user might not
        // have permission. Or maybe we should restrict updates to the Client
        // subject (and ban User, Org, and Site).
        updateExtensionSettings: (subjectID, { extensionID, edit, enabled, remove }) => {
            if (subjectID !== 'Client') {
                return throwError('Cannot update settings for ' + subjectID + '.')
            }
            console.log('updateext', subjectID, extensionID, enabled, remove)
            const update = new Subject<undefined>()
            // TODO(chris) could lensify this
            // TODO(chris) could promisify/observify this
            storage.getSync(storageItems => {
                console.log('getSync', storageItems)
                const format = { tabSize: 2, insertSpaces: true, eol: '\n' }
                if (edit) {
                    storageItems.clientSettings = applyEdits(
                        storageItems.clientSettings,
                        setProperty(storageItems.clientSettings, edit.path, edit.value, format)
                    )
                } else if (typeof enabled === 'boolean') {
                    storageItems.clientSettings = applyEdits(
                        storageItems.clientSettings,
                        setProperty(storageItems.clientSettings, ['extensions', extensionID], enabled, format)
                    )
                } else if (remove) {
                    storageItems.clientSettings = applyEdits(
                        storageItems.clientSettings,
                        removeProperty(storageItems.clientSettings, ['extensions', extensionID], format)
                    )
                }
                storage.setSync(storageItems, () => {
                    console.log('setSync', storageItems)

                    update.next(undefined)
                })
            })
            return update
        },

        queryGraphQL: (request, variables) =>
            sourcegraphURLSubject.pipe(
                take(1),
                mergeMap(url =>
                    queryGraphQL(getContext({ repoKey: '', isRepoSpecific: false }), request, variables, [url])
                )
            ),
        icons: {
            Loader: Loader as React.ComponentType<{ className: 'icon-inline' }>,
            Warning: Warning as React.ComponentType<{ className: 'icon-inline' }>,
        },
    })
}
