import { upperFirst } from 'lodash'
import * as React from 'react'
import { merge, Observable, Subject, Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged, map, skip, withLatestFrom } from 'rxjs/operators'

export enum ConnectionErrors {
    AuthError,
    UnableToConnect,
}

interface StatusClassNames {
    connecting: 'warning'
    connected: 'success'
    error: 'error'
}

const statusClassNames: StatusClassNames = {
    connecting: 'warning',
    connected: 'success',
    error: 'error',
}

/**
 * This is the [Word-Joiner](https://en.wikipedia.org/wiki/Word_joiner) character.
 * We are using this as a &nbsp; that has no width to maintain line height when the
 * url is being updated (therefore no text is in the status indicator).
 */
const zeroWidthNbsp = '\u2060'

export interface ServerURLFormProps {
    className?: string
    status: keyof StatusClassNames
    connectionError?: ConnectionErrors

    value: string
    onChange: (value: string) => void
    onSubmit: () => void

    /**
     * Overrides `this.props.status` and `this.state.isUpdating` in order to
     * display the `isUpdating` UI state. This is only intended for use in storybooks.
     */
    overrideUpdatingState?: boolean
}

interface State {
    isUpdating: boolean
}

export class ServerURLForm extends React.Component<ServerURLFormProps> {
    public state: State = { isUpdating: false }

    private componentUpdates = new Subject<ServerURLFormProps>()

    private inputElement = React.createRef<HTMLInputElement>()

    private inputFocuses = new Subject<void>()
    private nextInputFocus = () => this.inputFocuses.next()

    private formSubmits = new Subject<void>()

    private subscriptions = new Subscription()

    // constructor(props: ServerURLFormProps) {
    //     super(props)

    //     const propsWhenEventOccured: Observable<ServerURLFormProps> = this.inputFocuses.pipe(
    //         withLatestFrom(this.componentUpdates),
    //         map(([, props]) => props)
    //     )

    //     const propsWhenFormSubmitted = this.formSubmissions.pipe(
    //         withLatestFrom(this.componentUpdates),
    //         map(([, props]) => props)
    //     )

    //     const newProps = this.componentUpdates.pipe(
    //         distinctUntilChanged((x, y) => x.value === y.value),
    //         // Skip the first input from `componentDidMount()`
    //         skip(1)
    //     )

    //     const propsWhenBeganUpdating = merge(newProps, propsWhenEventOccured)

    //     this.subscriptions.add(
    //         propsWhenBeganUpdating.subscribe(() => {
    //             this.setState({ isUpdating: true, error: undefined })
    //         })
    //     )

    //     const submitAfterInactivity = propsWhenBeganUpdating.pipe(debounceTime(5000))

    //     this.subscriptions.add(
    //         merge(propsWhenFormSubmitted, submitAfterInactivity)
    //             .pipe(
    //                 map(({ value }) => value),
    //                 // Prevent double submission when user presses enter.
    //                 distinctUntilChanged()
    //             )
    //             .subscribe(() => {
    //                 console.log('sobmit')
    //                 this.props.onSubmit()

    //                 if (this.inputElement.current) {
    //                     this.inputElement.current.blur()
    //                 }

    //                 this.setState({ isUpdating: false })
    //             })
    //     )
    // }

    constructor(props: ServerURLFormProps) {
        super(props)

        const propsWhenEventOccured: Observable<ServerURLFormProps> = this.inputFocuses.pipe(
            withLatestFrom(this.componentUpdates),
            map(([, props]) => props)
        )

        const propsWhenFormSubmitted = this.formSubmits.pipe(
            withLatestFrom(this.componentUpdates),
            map(([, props]) => props)
        )

        const newProps = this.componentUpdates.pipe(
            distinctUntilChanged((x, y) => x.value === y.value),
            // Skip the first input from `componentDidMount()`
            skip(1)
        )

        const propsWhenBeganUpdating = merge(newProps, propsWhenEventOccured)

        this.subscriptions.add(
            propsWhenBeganUpdating.subscribe(() => {
                this.setState({ isUpdating: true, error: undefined })
            })
        )

        const submitAfterInactivity = propsWhenBeganUpdating.pipe(debounceTime(5000))

        this.subscriptions.add(
            merge(propsWhenFormSubmitted, submitAfterInactivity)
                .pipe(
                    map(({ value }) => value),
                    // Prevent double submission when user presses enter.
                    distinctUntilChanged()
                )
                .subscribe(() => {
                    this.props.onSubmit()

                    if (this.inputElement.current) {
                        this.inputElement.current.blur()
                    }

                    this.setState({ isUpdating: false })
                })
        )
    }

    public componentDidMount(): void {
        this.componentUpdates.next(this.props)
    }

    public componentDidUpdate(): void {
        console.log('did update')
        this.componentUpdates.next(this.props)
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): React.ReactNode {
        return (
            <form className={`server-url-form ${this.props.className || ''}`} onSubmit={this.handleSubmit}>
                <label>Sourcegraph URL</label>
                <div className="server-url-form__input-container">
                    <div className="server-url-form__input-container__status">
                        <span
                            className={
                                'server-url-form__input-container__status__indicator ' +
                                'server-url-form__input-container__status__indicator--' +
                                (this.isUpdating ? 'default' : statusClassNames[this.props.status])
                            }
                        />
                        <span className="server-url-form__input-container__status__text">
                            {this.isUpdating ? zeroWidthNbsp : upperFirst(this.props.status)}
                        </span>
                    </div>
                    <input
                        type="text"
                        ref={this.inputElement}
                        value={this.props.value}
                        className="server-url-form__input-container__input"
                        onChange={this.handleChange}
                        onFocus={this.nextInputFocus}
                    />
                </div>
                {!this.state.isUpdating &&
                    this.props.connectionError === ConnectionErrors.AuthError && (
                        <div className="server-url-form__error">
                            Authentication to Sourcegraph failed.{' '}
                            <a href={this.props.value}>Sign in to your instance</a> to continue.
                        </div>
                    )}
                {!this.state.isUpdating &&
                    this.props.connectionError === ConnectionErrors.UnableToConnect && (
                        <div className="server-url-form__error">
                            <p>
                                Unable to connect to <a href={this.props.value}>{this.props.value}</a>. Ensure the URL
                                is correct and you are logged in.
                            </p>
                            <p>
                                <b>If you are an admin,</b> please ensure that{' '}
                                <a href="https://docs.sourcegraph.com/admin/site_config/all#auth-accesstokens-object">
                                    all users can create access tokens
                                </a>{' '}
                                or you have added your code hosts to your{' '}
                                <a href="https://docs.sourcegraph.com/admin/site_config/all#corsorigin-string">
                                    corsOrigin setting.
                                </a>
                            </p>
                        </div>
                    )}
            </form>
        )
    }

    private handleChange = ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
        this.props.onChange(value)
    }

    private handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        this.formSubmits.next()
    }

    private get isUpdating(): boolean {
        if (typeof this.props.overrideUpdatingState !== 'undefined') {
            console.warn(
                '<ServerURLForm /> - You are using the `overrideUpdatingState` prop which is ' +
                    'only intended for use with storybooks. Keeping this state in multiple places can ' +
                    'lead to race conditions and will be hard to maintain.'
            )

            return this.props.overrideUpdatingState
        }

        return this.state.isUpdating
    }
}
