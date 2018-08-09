import { mapValues } from 'lodash'

export interface RepoLocations {
    [key: string]: string
}

export interface PhabricatorMapping {
    callsign: string
    path: string
}

export type Feature = 'newTooltips' | 'CXP'

/**
 * Information about a feature flag.
 */
export interface FeatureFlag {
    /**
     * This is shown next to the check box in the options UI.
     */
    title: string
    default: boolean
}

/**
 * The feature flags available.
 */
export type FeatureFlags = Record<Feature, FeatureFlag>

export const featureFlags: FeatureFlags = {
    newTooltips: {
        title: 'Pretty hover tooltips',
        default: true,
    },
    CXP: {
        title: 'Use new LSP client implementation',
        default: false,
    },
}

// TODO(chris) wrap this in Partial<>
export interface StorageItems {
    sourcegraphURL: string
    gitHubEnterpriseURL: string
    phabricatorURL: string
    inlineSymbolSearchEnabled: boolean
    renderMermaidGraphsEnabled: boolean
    repositoryFileTreeEnabled: boolean
    executeSearchEnabled: boolean
    sourcegraphRepoSearchToggled: boolean
    openEditorEnabled: boolean
    identity: string
    serverUrls: string[]
    enterpriseUrls: string[]
    serverUserId: string
    hasSeenServerModal: boolean
    repoLocations: RepoLocations
    phabricatorMappings: PhabricatorMapping[]
    openFileOnSourcegraph: boolean
    sourcegraphAnonymousUid: string
    disableExtension: boolean
    /**
     * Storage for feature flags
     */
    featureFlags: Partial<Record<Feature, boolean>>
    /**
     * Overrides settings from Sourcegraph.
     */
    clientSettings: string
}

export const defaultStorageItems: StorageItems = {
    sourcegraphURL: 'https://sourcegraph.com',
    serverUrls: ['https://sourcegraph.com'],
    gitHubEnterpriseURL: '',
    phabricatorURL: '',
    inlineSymbolSearchEnabled: true,
    renderMermaidGraphsEnabled: false,
    repositoryFileTreeEnabled: true,
    executeSearchEnabled: false,
    sourcegraphRepoSearchToggled: true,
    openEditorEnabled: false,
    identity: '',
    enterpriseUrls: [],
    serverUserId: '',
    hasSeenServerModal: false,
    repoLocations: {},
    phabricatorMappings: [],
    openFileOnSourcegraph: true,
    sourcegraphAnonymousUid: '',
    disableExtension: false,
    featureFlags: mapValues(featureFlags, v => v.default) as Record<Feature, boolean>,
    clientSettings: '',
}

export type StorageChange = { [key in keyof StorageItems]: chrome.storage.StorageChange }
