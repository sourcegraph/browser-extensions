import { Observable } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import storage from '../../browser/storage'

export const getAccessToken = (): Observable<string> =>
    new Observable(observer => {
        storage.getSync(items => {
            observer.next(items.accessToken)
            observer.complete()
        })
    })

export const setAccessToken = () => (tokens: Observable<string>): Observable<string> =>
    tokens.pipe(
        switchMap(
            accessToken =>
                new Observable<string>(observer => {
                    storage.setSync({ accessToken }, () => {
                        observer.next(accessToken)
                        observer.complete()
                    })
                })
        )
    )
