import { from, Observable } from 'rxjs'
import { ReviewBoardRepository } from '../util'

function getRepository(repoID: number): Promise<ReviewBoardRepository> {
    return new Promise((resolve, reject) => {
        fetch(`${window.location.origin}/api/repositories/${repoID}/`, {
            method: 'GET',
            credentials: 'include',
            headers: new Headers({ Accept: 'application/json' }),
        })
            .then(resp => resp.json())
            .then(resp => resolve(resp.repository))
            .catch(err => reject(err))
    })
}

export function getRepositoryFromReviewBoardAPI(repoID: number): Observable<ReviewBoardRepository> {
    return from(getRepository(repoID))
}
