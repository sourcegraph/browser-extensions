import { isDefined } from '@sourcegraph/codeintellify/lib/helpers'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { of, Subscription } from 'rxjs'
import { filter, map, share, switchMap } from 'rxjs/operators'
import * as permissions from '../../../browser/permissions'
import storage from '../../../browser/storage'
import { StorageItems } from '../../../browser/types'
import { GQL } from '../../../types/gqlschema'
import { getAccessToken, setAccessToken } from '../../auth/access_token'
import { createAccessToken } from '../../backend/auth'
import { fetchCurrentUser } from '../../backend/server'
import { ConnectionCard } from './ConnectionCard'
import { FeatureFlagCard } from './FeatureFlagCard'

interface Props extends RouteComponentProps<any> {}
interface State {
    currentUser: GQL.IUser | undefined
    storage: StorageItems | undefined
    permissionOrigins: string[]
    token?: string
}

/**
 * A page displaying an overview of the extension configuration state.
 */
export class OptionsConfiguration extends React.Component<Props, State> {
    private subscriptions = new Subscription()

    constructor(props: Props) {
        super(props)
        this.state = {
            storage: undefined,
            currentUser: undefined,
            permissionOrigins: [],
        }
    }

    public componentDidMount(): void {
        const fetchingUser = fetchCurrentUser().pipe(share())

        this.subscriptions.add(
            fetchingUser.subscribe(user => {
                this.setState(() => ({ currentUser: user }))
            })
        )

        this.subscriptions.add(
            fetchingUser
                .pipe(
                    filter(isDefined),
                    switchMap(user => getAccessToken().pipe(map(token => ({ token, user })))),
                    switchMap(({ user, token }) => {
                        if (token) {
                            return of(token)
                        }

                        return createAccessToken(user.id).pipe(setAccessToken())
                    })
                )
                .subscribe(token => this.setState({ token }))
        )

        storage.onChanged(() => {
            this.updateForStorageItems()
        })
        permissions.onAdded(() => {
            this.updateForPermissions()
        })
        permissions.onRemoved(() => {
            this.updateForPermissions()
        })
        this.updateForStorageItems()
        this.updateForPermissions()
    }

    private updateForStorageItems = () => {
        storage.getSync(items => {
            this.setState(() => ({ storage: items }))
        })
    }

    private updateForPermissions = () => {
        permissions.getAll().then(
            permissions => {
                this.setState(() => ({ permissionOrigins: permissions.origins || [] }))
            },
            () => {
                /** noop */
            }
        )
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        const { storage, currentUser, permissionOrigins } = this.state
        if (!storage) {
            return null
        }
        return (
            <div className="options-configuation-page">
                <ConnectionCard permissionOrigins={permissionOrigins} storage={storage} currentUser={currentUser} />
                <FeatureFlagCard storage={storage} />
            </div>
        )
    }
}
