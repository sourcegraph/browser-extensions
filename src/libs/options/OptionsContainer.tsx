import * as React from 'react'
import { of, Subject, Subscription } from 'rxjs'
import { catchError, map, switchMap, tap } from 'rxjs/operators'
import { getExtensionVersionSync } from '../../browser/runtime'
import { ERAUTHREQUIRED, isErrorLike } from '../../shared/backend/errors'
import { fetchSite } from '../../shared/backend/server'
import { sourcegraphUrl } from '../../shared/util/context'
import { OptionsMenu, OptionsMenuProps } from './Menu'
import { ConnectionErrors } from './ServerURLForm'
import { getConfigurableSettings, setConfigurabelSettings, setSourcegraphURL } from './settings'

interface OptionsContainerState
    extends Pick<
            OptionsMenuProps,
            'isSettingsOpen' | 'status' | 'sourcegraphURL' | 'settings' | 'settingsHaveChanged' | 'connectionError'
        > {}

export class OptionsContainer extends React.Component<{}, OptionsContainerState> {
    public state: OptionsContainerState = {
        status: 'connecting',
        sourcegraphURL: sourcegraphUrl,
        isSettingsOpen: false,
        settingsHaveChanged: false,
        settings: {},
    }

    private version = getExtensionVersionSync()

    private urlUpdates = new Subject<string>()
    private settingsSaves = new Subject<any>()

    private subscriptions = new Subscription()

    constructor(props: {}) {
        super(props)

        this.subscriptions.add(
            this.urlUpdates
                .pipe(
                    tap(a => {
                        console.log('a', a)
                    }),
                    switchMap(url => fetchSite(url).pipe(map(() => url))),
                    catchError(err => of(err))
                )
                .subscribe(res => {
                    let url = ''

                    if (isErrorLike(res)) {
                        this.setState({
                            status: 'error',
                            connectionError:
                                res.code === ERAUTHREQUIRED
                                    ? ConnectionErrors.AuthError
                                    : ConnectionErrors.UnableToConnect,
                        })
                        url = this.state.sourcegraphURL
                    } else {
                        this.setState({ status: 'connected' })
                        url = res
                    }

                    console.log(res, url)

                    setSourcegraphURL(url)
                })
        )

        this.subscriptions.add(
            this.settingsSaves.pipe(switchMap(settings => setConfigurabelSettings(settings))).subscribe(settings => {
                this.setState({
                    settings,
                    settingsHaveChanged: false,
                })
            })
        )
    }

    public componentDidMount(): void {
        getConfigurableSettings().subscribe(settings => {
            this.setState({ settings })
        })

        console.log('next url')
        this.urlUpdates.next(this.state.sourcegraphURL)
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): React.ReactNode {
        return (
            <OptionsMenu
                {...this.state}
                version={this.version}
                onURLChange={this.handleURLChange}
                onURLSubmit={this.handleURLSubmit}
                onSettingsClick={this.handleSettingsClick}
                onSettingsChange={this.handleSettingsChange}
                onSettingsSave={this.handleSettingsSave}
            />
        )
    }

    private handleURLChange = (value: string) => {
        this.urlUpdates.next(this.state.sourcegraphURL)
    }

    private handleURLSubmit = () => {
        console.log('submitted', this.state.sourcegraphURL)
        this.urlUpdates.next(this.state.sourcegraphURL)
    }

    private handleSettingsClick = () => {
        this.setState(({ isSettingsOpen }) => ({ isSettingsOpen: !isSettingsOpen }))
    }

    private handleSettingsChange = (settings: any) => {
        this.setState({ settings, settingsHaveChanged: true })
    }

    private handleSettingsSave = () => {
        this.settingsSaves.next(this.state.settings)
    }
}
