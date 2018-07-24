import * as React from 'react'

import { Subscription } from 'rxjs'
import storage from '../../extension/storage'
import { CXP_CONTROLLER } from '../backend/cxp'
import { setServerUrls } from '../util/context'
import { CodeIntelStatusIndicator } from './CodeIntelStatusIndicator'
import {
    ContributableMenu,
    ContributedActions,
    Contributions,
    CXPControllerProps,
    ExtensionsProps,
} from './CXPCommands'
import { OpenOnSourcegraph } from './OpenOnSourcegraph'

export interface ButtonProps {
    className: string
    style: React.CSSProperties
    iconStyle?: React.CSSProperties
}

interface CodeViewToolbarProps extends ExtensionsProps, CXPControllerProps {
    repoPath: string
    filePath: string

    baseCommitID: string
    baseRev?: string
    headCommitID?: string
    headRev?: string

    onEnabledChange?: (enabled: boolean) => void

    buttonProps: ButtonProps
}

interface CodeViewToolbarState {
    contributions: Contributions
}

export class CodeViewToolbar extends React.Component<CodeViewToolbarProps, CodeViewToolbarState> {
    private subscriptions = new Subscription()

    constructor(props: CodeViewToolbarProps) {
        super(props)
        this.state = {
            contributions: {},
        }
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public componentDidMount(): void {
        storage.onChanged(items => {
            if (items.serverUrls && items.serverUrls.newValue) {
                setServerUrls(items.serverUrls.newValue)
            }
        })

        this.subscriptions.add(
            CXP_CONTROLLER.registries.contribution.contributions.subscribe(contributions => {
                this.setState(prevState => ({ contributions }))
            })
        )
    }

    public render(): JSX.Element | null {
        return (
            <div style={{ display: 'inline-flex', verticalAlign: 'middle', alignItems: 'center' }}>
                <ContributedActions
                    menu={ContributableMenu.EditorTitle}
                    contributions={this.state.contributions}
                    cxpController={this.props.cxpController}
                />
                <CodeIntelStatusIndicator
                    key="code-intel-status"
                    userIsSiteAdmin={false}
                    repoPath={this.props.repoPath}
                    commitID={this.props.baseCommitID}
                    filePath={this.props.filePath}
                    onChange={this.props.onEnabledChange}
                />
                <OpenOnSourcegraph
                    label={`View File${this.props.headCommitID ? ' (base)' : ''}`}
                    ariaLabel="View file on Sourcegraph"
                    openProps={{
                        repoPath: this.props.repoPath,
                        filePath: this.props.filePath,
                        rev: this.props.baseRev || this.props.baseCommitID,
                        query: this.props.headCommitID
                            ? {
                                  diff: {
                                      rev: this.props.baseCommitID,
                                  },
                              }
                            : undefined,
                    }}
                    className={this.props.buttonProps.className}
                    style={this.props.buttonProps.style}
                    iconStyle={this.props.buttonProps.iconStyle}
                />
                {this.props.headCommitID && (
                    <OpenOnSourcegraph
                        label={'View File (head)'}
                        ariaLabel="View file on Sourcegraph"
                        openProps={{
                            repoPath: this.props.repoPath,
                            filePath: this.props.filePath,
                            rev: this.props.headRev || this.props.headCommitID,
                            query: {
                                diff: {
                                    rev: this.props.baseCommitID,
                                },
                            },
                        }}
                        className={this.props.buttonProps.className}
                        style={this.props.buttonProps.style}
                        iconStyle={this.props.buttonProps.iconStyle}
                    />
                )}
            </div>
        )
    }
}
