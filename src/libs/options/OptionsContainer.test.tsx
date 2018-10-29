import { assert } from 'chai'
import { describe, it } from 'mocha'
import * as React from 'react'
import { render } from 'react-testing-library'
import { noop, Observable, of } from 'rxjs'
import sinon from 'sinon'
import { FeatureFlags } from '../../browser/types'
import { OptionsContainer } from './OptionsContainer'

describe('OptionsContainer', () => {
    const stubGetConfigurableSettings = () => new Observable<Partial<FeatureFlags>>()
    const stubSetConfigurableSettings = (settings: Observable<Partial<FeatureFlags>>) =>
        new Observable<Partial<FeatureFlags>>()
    const stub

    it('checks the connection status when it renders', () => {
        const fetchSiteSpy = sinon.spy()
        const fetchSite = (url: string) => {
            fetchSiteSpy(url)

            return of(undefined)
        }

        render(
            <OptionsContainer
                sourcegraphURL={'url'}
                fetchSite={fetchSite}
                setSourcegraphURL={noop}
                getConfigurableSettings={stubGetConfigurableSettings}
                setConfigurableSettings={stubSetConfigurableSettings}
            />
        )

        assert.isTrue(fetchSiteSpy.calledOnceWith('url'))
    })

    it('handles when an error is thrown checking the site connection', () => {
        const fetchSite = () => {
            throw new Error('no site, woops')
        }

        try {
            render(
                <OptionsContainer
                    sourcegraphURL={'url'}
                    fetchSite={fetchSite}
                    setSourcegraphURL={noop}
                    getConfigurableSettings={stubGetConfigurableSettings}
                    setConfigurableSettings={stubSetConfigurableSettings}
                />
            )
        } catch (err) {
            throw new Error("shouldn't be hit")
        }
    })

    it('creates a token when no token exists after connection check', () => {})
})
