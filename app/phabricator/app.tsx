import { featureFlags } from '../util/featureFlags'
import { injectPhabricatorBlobAnnotators } from './inject'
import { injectPhabricatorBlobAnnotators as injectPhabricatorBlobAnnotatorsOld } from './inject_old'
import { expanderListen, javelinPierce, metaClickOverride, setupPageLoadListener } from './util'

// This is injection for the chrome extension.
export function injectPhabricatorApplication(): void {
    // make sure this is called before javelinPierce
    const inject = () => {
        javelinPierce(expanderListen, 'body')
        javelinPierce(metaClickOverride, 'body')

        injectModules()
    }

    if (document.readyState === 'complete') {
        injectModules()
    } else {
        document.addEventListener('phabPageLoaded', inject)
        javelinPierce(setupPageLoadListener, 'body')
    }
}

function injectModules(): void {
    featureFlags
        .isEnabled('newTooltips')
        .then(
            enabled =>
                enabled
                    ? injectPhabricatorBlobAnnotators().catch(e => console.error(e))
                    : injectPhabricatorBlobAnnotatorsOld().catch(e => console.error(e))
        )
}
