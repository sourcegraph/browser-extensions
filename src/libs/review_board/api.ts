import { Observable } from 'rxjs'
import { ajax } from 'rxjs/ajax'
import { map } from 'rxjs/operators'

import { ReviewBoardRepository } from './state'

export const getRepository = (repoID: number): Observable<ReviewBoardRepository> =>
    ajax({
        method: 'GET',
        url: `${window.location.origin}/api/repositories/${repoID}/`,
        headers: new Headers({ Accept: 'application/json' }),
        withCredentials: true,
    }).pipe(map(({ response }) => response as ReviewBoardRepository))
