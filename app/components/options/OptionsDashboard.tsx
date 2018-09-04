import * as React from 'react'
import { Route, Switch } from 'react-router'
import { HashRouter } from 'react-router-dom'
import { OptionsConfiguration } from './OptionsConfiguration'

export class OptionsDashboard extends React.Component<any, {}> {
    public render(): JSX.Element {
        return (
            <HashRouter>
                <div className="site-admin-area area">
                    <div className="area__content">
                        <Switch>
                            <Route path="/" component={OptionsConfiguration} exact={true} />
                        </Switch>
                    </div>
                </div>
            </HashRouter>
        )
    }
}
