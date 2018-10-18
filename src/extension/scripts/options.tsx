// We want to polyfill first.
// prettier-ignore
import '../../config/polyfill'

import * as React from 'react'
import { render } from 'react-dom'
import storage from '../../browser/storage'
import { OptionsContainer } from '../../libs/options/OptionsContainer'
import { assertEnv } from '../envAssertion'

assertEnv('OPTIONS')

const inject = () => {
    const injectDOM = document.createElement('div')
    injectDOM.id = 'sourcegraph-options-menu'
    injectDOM.className = 'options'
    document.body.appendChild(injectDOM)

    storage.getSync(items => {
        render(<OptionsContainer />, injectDOM)
    })
}

document.addEventListener('DOMContentLoaded', () => {
    inject()
})
