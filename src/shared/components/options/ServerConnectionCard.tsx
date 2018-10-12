import * as React from 'react'
import {
    Alert,
    Badge,
    Button,
    Card,
    CardBody,
    CardHeader,
    Col,
    FormGroup,
    FormText,
    Input,
    InputGroup,
    ListGroupItemHeading,
    Row,
} from 'reactstrap'
import { DEFAULT_SOURCEGRAPH_URL, isSourcegraphDotCom } from '../../util/context'

export interface Props {
    userIsAdmin: boolean
    isConnected: boolean
    hasCodeIntelligence: boolean
    error: boolean

    sourcegraphUrl: string

    permissionOrigins: string[]
    contentScriptUrls: string[]

    onUrlChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    onSave: () => void
    onCancelClick: () => void
    onCheckConnectionClick: () => void
    onGrantPermissionsClick: () => void
}

export class ServerConnectionCard extends React.Component<Props> {
    private input: HTMLInputElement | null = null

    public render(): JSX.Element | null {
        return (
            <Row className="pb-3">
                <Col>
                    <Card>
                        <CardHeader>Sourcegraph Configuration</CardHeader>
                        <CardBody>
                            <Col className="px-0">
                                <ListGroupItemHeading>Server Connection</ListGroupItemHeading>
                                <form onSubmit={this.handleFormSubmit}>
                                    <FormGroup>
                                        <InputGroup>
                                            <Input
                                                invalid={!!this.props.error}
                                                type="url"
                                                required={true}
                                                innerRef={this.updateRef}
                                                defaultValue={this.props.sourcegraphUrl}
                                                onChange={this.props.onUrlChange}
                                            />
                                            <div>
                                                <Button
                                                    color="primary"
                                                    className="btn btn-primary"
                                                    type="submit"
                                                    disabled={this.props.sourcegraphUrl !== this.props.sourcegraphUrl}
                                                >
                                                    Save
                                                </Button>
                                                <Button
                                                    onClick={this.handleCancelClick}
                                                    color="secondary"
                                                    className="btn btn-secondary"
                                                    disabled={this.props.sourcegraphUrl !== this.props.sourcegraphUrl}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </InputGroup>
                                        {this.props.error && (
                                            <FormText color="muted">Please enter a valid URL.</FormText>
                                        )}
                                    </FormGroup>
                                </form>
                                <ListGroupItemHeading className="pt-3">
                                    Status: <Badge color={this.getStatusState()}>{this.getStatusText()}</Badge>
                                    <Button
                                        onClick={this.props.onCheckConnectionClick}
                                        size="sm"
                                        color="secondary"
                                        className="float-right"
                                    >
                                        Check Connection
                                    </Button>
                                </ListGroupItemHeading>
                                {this.renderSourcegraphServerAlert()}
                            </Col>
                        </CardBody>
                    </Card>
                </Col>
            </Row>
        )
    }

    private updateRef = (ref: HTMLInputElement | null): void => {
        this.input = ref
    }

    private handleFormSubmit = (event: React.FormEvent<HTMLElement>) => {
        event.preventDefault()

        this.props.onSave()
    }

    private handleCancelClick = () => {
        if (this.input) {
            this.input.blur()
        }

        this.props.onCancelClick()
    }

    private getStatusText = (): string => {
        if (isSourcegraphDotCom(this.props.sourcegraphUrl)) {
            return 'Limited Functionality'
        }

        if (this.props.isConnected) {
            return 'Connected'
        }

        return 'Unable to Connect'
    }

    private getStatusState = (): string => {
        if (isSourcegraphDotCom(this.props.sourcegraphUrl)) {
            return 'warning'
        }

        if (this.props.isConnected) {
            return 'success'
        }

        return 'error'
    }

    private renderSourcegraphServerAlert = (): JSX.Element => {
        const { permissionOrigins } = this.props
        if (this.props.sourcegraphUrl === DEFAULT_SOURCEGRAPH_URL) {
            return (
                <div className="pt-2">
                    <Alert color="warning">Add a Server URL to enable support on private code.</Alert>
                </div>
            )
        }

        if (!this.props.isConnected) {
            return (
                <div className="pt-2">
                    <Alert color="danger">
                        Error connecting to Server. Ensure you are authenticated and that the URL is correct.
                    </Alert>
                </div>
            )
        }

        const forbiddenUrls = permissionOrigins.includes('<all_urls>')
            ? []
            : this.props.contentScriptUrls.filter(url => !permissionOrigins.includes(`${url}/*`))
        if (forbiddenUrls.length !== 0) {
            return (
                <div className="pt-2">
                    <Alert color="warning">
                        {`Missing content script permissions: ${forbiddenUrls.join(', ')}.`}
                        <div className="pt-2">
                            <Button
                                onClick={this.props.onGrantPermissionsClick}
                                color="primary"
                                className="btn btn-secondary btn-sm"
                                size="sm"
                            >
                                Grant permissions
                            </Button>
                        </div>
                    </Alert>
                </div>
            )
        }

        if (!this.props.hasCodeIntelligence) {
            return (
                <div className="pt-2">
                    <Alert color="info">
                        {!this.props.userIsAdmin &&
                            `Code intelligence is not enabled. Contact your site admin to enable language servers. Code
                        intelligence is available for open source repositories.`}
                        {this.props.userIsAdmin && (
                            <div>
                                Code intelligence is disabled. Enable code intelligence for jump to definition, hover
                                tooltips, and find references.
                                <div className="pt-2">
                                    <Button
                                        href={`${this.props.sourcegraphUrl}/site-admin/code-intelligence`}
                                        color="primary"
                                        className="btn btn-secondary btn-sm"
                                        size="sm"
                                    >
                                        Enable Code Intellligence
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Alert>
                </div>
            )
        }

        return (
            <div className="pt-2">
                <Alert color="success">
                    You are connected to your server and code intelligence is fully functional.
                    <div className="pt-2">
                        <Button
                            href={this.props.sourcegraphUrl}
                            color="primary"
                            className="btn btn-secondary btn-sm"
                            size="sm"
                        >
                            Open Sourcegraph
                        </Button>
                    </div>
                </Alert>
            </div>
        )
    }
}
