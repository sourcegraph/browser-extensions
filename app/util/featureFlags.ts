import storage from '../../extension/storage'
import { Feature } from '../../extension/types'

/**
 * Gets the value of a feature flag.
 * @param key is the key the feature flag is stored under.
 */
export function get(key: Feature): Promise<boolean> {
    return new Promise(resolve => storage.getSync(({ featureFlags }) => resolve(featureFlags && featureFlags[key])))
}

/**
 * Set the value of a feature flag.
 * @param key
 * @param val
 * @returns a promise that resolves after the flag has been set.
 */
export function set(key: Feature, val: boolean): Promise<void> {
    return new Promise(resolve =>
        storage.getSync(({ featureFlags }) =>
            storage.setSync({ featureFlags: { ...featureFlags, [key]: val } }, resolve)
        )
    )
}

/** Toggle boolean feature flags. */
export function toggle(key: Feature): Promise<void> {
    return get(key).then(val => set(key, !val))
}
