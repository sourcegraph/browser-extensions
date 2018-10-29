import { propertyIsDefined } from '@sourcegraph/codeintellify/lib/helpers'
import * as React from 'react'
import { Observable, of, Subject, Subscription } from 'rxjs'
import { catchError, filter, map, switchMap } from 'rxjs/operators'
import { getExtensionVersionSync } from '../../browser/runtime'
import { AccessToken, FeatureFlags } from '../../browser/types'
import { ERAUTHREQUIRED, ErrorLike, isErrorLike } from '../../shared/backend/errors'
import { GQL } from '../../types/gqlschema'
import { OptionsMenu, OptionsMenuProps } from './Menu'
import { ConnectionErrors } from './ServerURLForm'

export interface OptionsContainerProps {
    sourcegraphURL: string

    fetchSite: (url: string) => Observable<void>
    fetchCurrentUser: (useToken: boolean) => Observable<GQL.IUser | undefined>

    setSourcegraphURL: (url: string) => void
    getConfigurableSettings: () => Observable<Partial<FeatureFlags>>
    setConfigurableSettings: (settings: Observable<Partial<FeatureFlags>>) => Observable<Partial<FeatureFlags>>

    createAccessToken: (url: string) => Observable<AccessToken>
    getAccessToken: (url: string) => Observable<AccessToken | undefined>
    setAccessToken: (url: string) => (tokens: Observable<AccessToken>) => Observable<AccessToken>
    fetchAccessTokenIDs: (url: string) => Observable<Pick<AccessToken, 'id'>[]>
}

interface OptionsContainerState
    extends Pick<
            OptionsMenuProps,
            'isSettingsOpen' | 'status' | 'sourcegraphURL' | 'settings' | 'settingsHaveChanged' | 'connectionError'
        > {}

export class OptionsContainer extends React.Component<OptionsContainerProps, OptionsContainerState> {
    private version = getExtensionVersionSync()

    private urlUpdates = new Subject<string>()
    private settingsSaves = new Subject<any>()

    private subscriptions = new Subscription()

    constructor(props: OptionsContainerProps) {
        super(props)

        this.state = {
            status: 'connecting',
            sourcegraphURL: props.sourcegraphURL,
            isSettingsOpen: false,
            settingsHaveChanged: false,
            settings: {},
            connectionError: undefined,
        }

        const fetchingSite: Observable<string | ErrorLike> = this.urlUpdates.pipe(
            switchMap(url => this.props.fetchSite(url).pipe(map(() => url))),
            catchError(err => of(err))
        )

        this.subscriptions.add(
            fetchingSite.subscribe(res => {
                let url = ''

                if (isErrorLike(res)) {
                    this.setState({
                        status: 'error',
                        connectionError:
                            res.code === ERAUTHREQUIRED ? ConnectionErrors.AuthError : ConnectionErrors.UnableToConnect,
                    })
                    url = this.state.sourcegraphURL
                } else {
                    this.setState({ status: 'connected' })
                    url = res
                }

                props.setSourcegraphURL(url)
            })
        )

        this.subscriptions.add(
            // Ensure the site is valid.
            fetchingSite
                .pipe(
                    filter(urlOrError => !isErrorLike(urlOrError)),
                    map(urlOrError => urlOrError as string),
                    // Get the access token for this server if we have it.
                    switchMap(url => this.props.getAccessToken(url).pipe(map(token => ({ token, url })))),
                    switchMap(({ url, token }) =>
                        this.props.fetchCurrentUser(false).pipe(map(user => ({ user, token, url })))
                    ),
                    filter(propertyIsDefined('user')),
                    // Get the IDs for all access tokens for the user.
                    switchMap(({ token, user, url }) =>
                        this.props
                            .fetchAccessTokenIDs(user.id)
                            .pipe(map(usersTokenIDs => ({ usersTokenIDs, user, token, url })))
                    ),
                    // Make sure the token still exists on the server. If it
                    // does exits, use it, otherwise create a new one.
                    switchMap(({ user, token, usersTokenIDs, url }) => {
                        const tokenExists = token && usersTokenIDs.map(({ id }) => id).includes(token.id)

                        return token && tokenExists
                            ? of(token)
                            : this.props.createAccessToken(user.id).pipe(this.props.setAccessToken(url))
                    })
                )
                .subscribe(() => {
                    // We don't need to do anything with the token now. We just
                    // needed to ensure we had one saved.
                })
        )

        this.subscriptions.add(
            this.settingsSaves
                .pipe(switchMap(settings => props.setConfigurableSettings(settings)))
                .subscribe(settings => {
                    this.setState({
                        settings,
                        settingsHaveChanged: false,
                    })
                })
        )
    }

    public componentDidMount(): void {
        this.props.getConfigurableSettings().subscribe(settings => {
            this.setState({ settings })
        })

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
