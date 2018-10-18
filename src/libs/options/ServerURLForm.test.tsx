import * as chai from 'chai'
import { describe, it } from 'mocha'
import * as React from 'react'
import { cleanup, fireEvent, render } from 'react-testing-library'
import { TestScheduler } from 'rxjs/testing'

import { EMPTY, merge, of, Subject } from 'rxjs'
import { map, switchMap, switchMapTo, tap } from 'rxjs/operators'
import { ServerURLForm } from './ServerURLForm'

describe('ServerURLForm', () => {
    after(cleanup)

    it('the onChange prop handler gets fired', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

        scheduler.run(({ cold, expectObservable }) => {
            const urls: { [key: string]: string } = {
                a: 'https://different.com',
            }

            const urlChanges = cold('a', urls).pipe(
                map(url => {
                    const changes = new Subject<string>()
                    const nextChange = (value: string) => changes.next(value)

                    const submits = new Subject<void>()
                    const nextSubmit = () => submits.next()

                    const { container } = render(
                        <ServerURLForm
                            value={'https://sourcegraph.com'}
                            status={'connected'}
                            onChange={nextChange}
                            onSubmit={nextSubmit}
                        />
                    )

                    const urlInput = container.querySelector('input')!

                    return { changes, submits, url, urlInput }
                }),
                switchMap(({ changes, url, urlInput }) => {
                    const emit = of(undefined).pipe(
                        tap(() => {
                            fireEvent.change(urlInput, { target: { value: url } })
                        }),
                        switchMap(() => EMPTY)
                    )

                    return merge(changes, emit)
                })
            )

            const values: { [key: string]: string } = {
                a: 'https://different.com',
            }

            expectObservable(urlChanges).toBe('a', values)
        })
    })

    it('captures the form submit event', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

        scheduler.run(({ cold, expectObservable }) => {
            const urls: { [key: string]: string } = {
                a: 'https://different.com',
            }

            const urlChanges = cold('a', urls).pipe(
                map(url => {
                    const changes = new Subject<string>()
                    const nextChange = (value: string) => changes.next(value)

                    const submits = new Subject<void>()
                    const nextSubmit = () => submits.next()

                    const { container } = render(
                        <ServerURLForm
                            value={'https://sourcegraph.com'}
                            status={'connected'}
                            onChange={nextChange}
                            onSubmit={nextSubmit}
                        />
                    )

                    const urlInput = container.querySelector('input')!

                    return { changes, submits, url, urlInput }
                }),
                switchMap(({ changes, url, urlInput }) => {
                    const emit = of(undefined).pipe(
                        tap(() => {
                            fireEvent.change(urlInput, { target: { value: url } })
                        }),
                        switchMap(() => EMPTY)
                    )

                    return merge(changes, emit)
                })
            )

            const values: { [key: string]: string } = {
                a: 'https://different.com',
            }

            expectObservable(urlChanges).toBe('a', values)
        })
    })

    // it('submits after 5 seconds of inactivity after a change', () => {
    //     const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

    //     scheduler.run(({ cold, expectObservable }) => {
    //         const urls: { [key: string]: string } = {
    //             a: 'https://different.com',
    //         }

    //         const inject = (nextChange: (value: string) => void, nextSubmit: () => void) => {
    //             const { container, rerender } = render(
    //                 <ServerURLForm
    //                     value={'https://sourcegraph.com'}
    //                     status={'connected'}
    //                     onChange={nextChange}
    //                     onSubmit={nextSubmit}
    //                 />
    //             )

    //             const rr = (value: string) =>
    //                 rerender(
    //                     <ServerURLForm value={value} status={'connected'} onChange={nextChange} onSubmit={nextSubmit} />
    //                 )

    //             return { rerender: rr, input: container.querySelector('input')! }
    //         }

    //         const submits = cold('a', urls).pipe(
    //             map(url => {
    //                 const changes = new Subject<string>()
    //                 const nextChange = (value: string) => changes.next(value)

    //                 const submits = new Subject<void>()
    //                 const nextSubmit = () => submits.next()

    //                 const { input, rerender } = inject(nextChange, nextSubmit)

    //                 return { changes, submits, url, input, rerender }
    //             }),
    //             switchMap(({ changes, submits, url, input, rerender }) => {
    //                 // const emit = of(undefined).pipe(
    //                 //     tap(() => {
    //                 //         fireEvent.change(input, { target: { value: url } })
    //                 //     }),
    //                 //     switchMap(() => EMPTY)
    //                 // )

    //                 const rerenders = changes.pipe(
    //                     tap(value => {
    //                         rerender(value)
    //                     }),
    //                     switchMapTo(EMPTY)
    //                 )

    //                 return merge(submits, rerenders)
    //             })
    //         )

    //         expectObservable(submits).toBe('5s a')
    //     })
    // })
})
