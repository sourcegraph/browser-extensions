import * as React from 'react'

import { action } from '@storybook/addon-actions'
import { storiesOf } from '@storybook/react'

import '../global.scss'

import { Props, ServerConnectionCard } from '../../src/shared/components/options/ServerConnectionCard'

const defaultProps: Props = {
    userIsAdmin: false,
    isConnected: true,
    hasCodeIntelligence: true,
    error: false,

    sourcegraphUrl: 'https://sourcegraph.com',

    permissionOrigins: [],
    contentScriptUrls: [],

    onUrlChange: action('url changed'),
    onSave: action('save'),
    onCancelClick: action('cancel clicked'),
    onCheckConnectionClick: action('check connection clicked'),
    onGrantPermissionsClick: action('grant permissions clicked'),
}

class StoryContainer extends React.Component<Partial<Props>, { url: string }> {
    constructor(props: Partial<Props>) {
        super(props)

        this.state = {
            url: props.sourcegraphUrl || 'https://sourcegraph.com',
        }
    }

    public render(): React.ReactNode {
        return (
            <div id="sourcegraph-options-menu" className="area__content">
                <ServerConnectionCard {...defaultProps} sourcegraphUrl={this.state.url} {...this.props} />
            </div>
        )
    }
}

storiesOf('ServerConnectionCard', module).add('Default', () => <StoryContainer />)
