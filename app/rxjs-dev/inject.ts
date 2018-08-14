import { of } from 'rxjs'

import { CodeViewInfo, injectCodeIntelligence } from '../code_intelligence/inject'

const codeView: CodeViewInfo = {
    selector: 'code-example',
    dom: {
        getCodeElementFromTarget: target => target.closest('li'),
        getLineNumberFromCodeElement: codeElement => {
            let count = 1
            let li = codeElement.previousSibling as Node | null
            while (li && li.previousSibling) {
                li = li.previousSibling
                count++
            }
            console.log(count + 2)
            return count + 2
        },
        getCodeElementFromLineNumber: (codeView, line) => {
            console.log(codeView, line, codeView.querySelector(`li:nth-of-type(${line - 1})`))
            return codeView.querySelector(`li:nth-of-type(${line - 1})`)
        },
    },
    getToolbarMount: () => null,
    createContextResolver: code => {
        const examplePath = code.getAttribute('path')!

        return of(() => ({
            repoPath: 'github.com/ReactiveX/rxjs',
            filePath: `docs_app/content/examples/${examplePath}`,
            commitID: '41c6574bc1e44fd3a3e9550352b802f698a079bc',
            rev: '41c6574bc1e44fd3a3e9550352b802f698a079bc',
        }))
    },
}

export function injectRXJSDocs(): void {
    setTimeout(() => injectCodeIntelligence({ codeViews: [codeView] }), 1500)
}
