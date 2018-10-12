import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { GQL } from '../../types/gqlschema'
import { getPlatformName } from '../util/context'
import { getContext } from './context'
import { createAggregateError } from './errors'
import { mutateGraphQLNoRetry } from './graphql'

export function createAccessToken(userID: GQL.ID): Observable<string> {
    return mutateGraphQLNoRetry(
        getContext({ repoKey: '' }),
        `
            mutation CreateAccessToken($userID: ID!, $scopes: [String!]!, $note: String!) {
                createAccessToken(user: $userID, scopes: $scopes, note: $note) {
                    id
                    token
                }
            }
        `,
        { userID, scopes: ['user:all'], note: `sourcegraph-${getPlatformName()}` }
    ).pipe(
        map(({ data, errors }) => {
            if (!data || !data.createAccessToken || (errors && errors.length > 0)) {
                throw createAggregateError(errors)
            }
            return data.createAccessToken.token
        })
    )
}
