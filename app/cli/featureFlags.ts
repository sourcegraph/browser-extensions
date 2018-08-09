import * as OmniCLI from 'omnicli'

import { map, noop } from 'lodash'
import { Feature, FeatureFlag, featureFlags } from '../../extension/types'
import { set, toggle } from '../util/featureFlags'

const keyIsFeatureFlag = (key: string): key is Feature => featureFlags[key] !== undefined

function featureFlagAction([flagName, value]: string[]): void {
    if (!keyIsFeatureFlag(flagName)) {
        return
    }

    const flagValue = { true: true, false: false }[value]

    if (flagValue === undefined) {
        console.error('Unknown flag value ' + value + '. Must be true/false.')
    }

    set(flagName, flagValue)
        .then(noop)
        .catch(err => console.log('unable to set feature flag ' + flagName + ':', err))
}

const featureFlagSuggestsions: OmniCLI.Suggestion[] = map(
    featureFlags,
    (featureFlag: FeatureFlag, flagName: Feature) => ({
        content: flagName,
        description: `${flagName} - ${featureFlag.title} (defaults to ${featureFlag.default})`,
    })
)

export const featureFlagsCommand: OmniCLI.Command = {
    name: 'feature-flag',
    alias: ['flag', 'ff'],
    action: featureFlagAction,
    getSuggestions: () => featureFlagSuggestsions,
    description: 'Set experimental feature flags',
}

function toggleFeatureFlagAction([key, value]: string[]): void {
    if (!keyIsFeatureFlag(key)) {
        return
    }

    toggle(key)
        .then(noop)
        .catch(err => console.log('unable to set feature flag'))
}

export const toggleFeatureFlagsCommand: OmniCLI.Command = {
    name: 'toggle-feature-flag',
    alias: ['toggle-flag', 'tff'],
    action: toggleFeatureFlagAction,
    getSuggestions: () => featureFlagSuggestsions,
    description: 'Toggle an experimental feature flag',
}
