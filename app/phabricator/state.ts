// import { ChangeState, DifferentialState, DiffusionState, RevisionState } from '.'
// import { getRepoDetailsFromCallsignObservable } from './backend'
// import { getCallsignFromPageTag } from './util'

// const PHAB_DIFFUSION_REGEX = /^\/?(source|diffusion)\/([A-Za-z0-9\-\_]+)\/browse\/([\w-]+\/)?([^;$]+)(;[0-9a-f]{40})?(?:\$[0-9]+)?/i

// export function getPhabricatorState(
//     loc: Location
// ): Promise<DiffusionState | DifferentialState | RevisionState | ChangeState | null> {
//     return new Promise((resolve, reject) => {
//         const stateUrl = loc.href.replace(loc.origin, '')
//         const diffusionMatch = PHAB_DIFFUSION_REGEX.exec(stateUrl)
//         const { protocol, hostname, port } = loc
//         if (diffusionMatch) {
//             const match = {
//                 protocol,
//                 hostname,
//                 port,
//                 viewType: diffusionMatch[1],
//                 callsign: diffusionMatch[2],
//                 branch: diffusionMatch[3],
//                 filePath: diffusionMatch[4],
//                 revInUrl: diffusionMatch[5], // only on previous versions
//             }
//             if (match.branch && match.branch.endsWith('/')) {
//                 // Remove trailing slash (included b/c branch group is optional)
//                 match.branch = match.branch.substr(match.branch.length - 1)
//             }

//             const callsign = getCallsignFromPageTag()
//             if (!callsign) {
//                 console.error('could not locate callsign for differential page')
//                 resolve(null)
//                 return
//             }
//             match.callsign = callsign
//             getRepoDetailsFromCallsignObservable(callsign)
//                 .then(({ repoPath }) => {
//                     const commitID = getCommitIDFromPageTag()
//                     if (!commitID) {
//                         console.error('cannot determine commitIDision from page')
//                         resolve(null)
//                         return
//                     }
//                     resolve({
//                         repoPath,
//                         filePath: match.filePath,
//                         mode: PhabricatorMode.Diffusion,
//                         commitID,
//                     })
//                 })
//                 .catch(reject)
//             return
//         }
//         const differentialMatch = PHAB_DIFFERENTIAL_REGEX.exec(stateUrl)
//         if (differentialMatch) {
//             const match = {
//                 protocol,
//                 hostname,
//                 port,
//                 differentialID: differentialMatch[1],
//                 diffID: differentialMatch[6],
//                 comparison: differentialMatch[7],
//             }

//             const differentialID = parseInt(match.differentialID.split('D')[1], 10)
//             let diffID = match.diffID ? parseInt(match.diffID, 10) : undefined

//             getRepoDetailsFromDifferentialID(differentialID)
//                 .then(({ callsign }) => {
//                     if (!callsign) {
//                         console.error(`callsign not found`)
//                         resolve(null)
//                         return
//                     }
//                     if (!diffID) {
//                         const fromPage = getDiffIdFromDifferentialPage()
//                         if (fromPage) {
//                             diffID = parseInt(fromPage, 10)
//                         }
//                     }
//                     if (!diffID) {
//                         console.error(`differential id not found on page.`)
//                         resolve(null)
//                         return
//                     }
//                     getRepoDetailsFromCallsign(callsign)
//                         .then(({ repoPath }) => {
//                             let baseRev = `phabricator/base/${diffID}`
//                             let headRev = `phabricator/diff/${diffID}`

//                             let leftDiffID: number | undefined

//                             const maxDiff = getMaxDiffFromTabView()
//                             const diffLanded = isDifferentialLanded()
//                             if (diffLanded && !maxDiff) {
//                                 console.error(
//                                     'looking for the final diff id in the revision contents table failed. expected final row to have the commit in the description field.'
//                                 )
//                                 return null
//                             }
//                             if (match.comparison) {
//                                 // urls that looks like this: http://phabricator.aws.sgdev.org/D3?vs=on&id=8&whitespace=ignore-most#toc
//                                 // if the first parameter (vs=) is not 'on', not sure how to handle
//                                 const comparisonMatch = COMPARISON_REGEX.exec(match.comparison)!
//                                 const leftID = comparisonMatch[1]
//                                 if (leftID !== 'on') {
//                                     leftDiffID = parseInt(leftID, 10)
//                                     baseRev = `phabricator/diff/${leftDiffID}`
//                                 } else {
//                                     baseRev = `phabricator/base/${comparisonMatch[2]}`
//                                 }
//                                 headRev = `phabricator/diff/${comparisonMatch[2]}`
//                                 if (diffLanded && maxDiff && comparisonMatch[2] === `${maxDiff.diffID}`) {
//                                     headRev = maxDiff.revDescription
//                                     baseRev = headRev.concat('~1')
//                                 }
//                             } else {
//                                 // check if the diff we are viewing is the max diff. if so,
//                                 // right is the merged rev into master, and left is master~1
//                                 if (diffLanded && maxDiff && diffID === maxDiff.diffID) {
//                                     headRev = maxDiff.revDescription
//                                     baseRev = maxDiff.revDescription.concat('~1')
//                                 }
//                             }
//                             resolve({
//                                 baseRepoPath: repoPath,
//                                 baseRev,
//                                 headRepoPath: repoPath,
//                                 headRev, // This will be blank on GitHub, but on a manually staged instance should exist
//                                 differentialID,
//                                 diffID,
//                                 leftDiffID,
//                                 mode: PhabricatorMode.Differential,
//                             })
//                         })
//                         .catch(reject)
//                 })
//                 .catch(reject)
//             return
//         }

//         const revisionMatch = PHAB_REVISION_REGEX.exec(stateUrl)
//         if (revisionMatch) {
//             const match = {
//                 protocol,
//                 hostname,
//                 port,
//                 callsign: revisionMatch[1],
//                 rev: revisionMatch[2],
//             }
//             getRepoDetailsFromCallsign(match.callsign)
//                 .then(({ repoPath }) => {
//                     const headCommitID = match.rev
//                     const baseCommitID = getBaseCommitIDFromRevisionPage()
//                     if (!baseCommitID) {
//                         console.error(`did not successfully determine parent revision.`)
//                         return null
//                     }
//                     resolve({
//                         repoPath,
//                         baseCommitID,
//                         headCommitID,
//                         mode: PhabricatorMode.Revision,
//                     })
//                 })
//                 .catch(reject)
//             return
//         }

//         const changeMatch = PHAB_CHANGE_REGEX.exec(stateUrl)
//         if (changeMatch) {
//             const match = {
//                 protocol: changeMatch[1],
//                 hostname: changeMatch[2],
//                 tld: changeMatch[3],
//                 port: changeMatch[4],
//                 viewType: changeMatch[5],
//                 callsign: changeMatch[6],
//                 branch: changeMatch[7],
//                 filePath: changeMatch[8],
//                 revInUrl: changeMatch[9], // only on previous versions
//             }

//             const callsign = getCallsignFromPageTag()
//             if (!callsign) {
//                 console.error('could not locate callsign for differential page')
//                 return null
//             }
//             match.callsign = callsign
//             getRepoDetailsFromCallsign(callsign)
//                 .then(({ repoPath }) => {
//                     const commitID = getCommitIDFromPageTag()
//                     if (!commitID) {
//                         console.error('cannot determine revision from page.')
//                         return null
//                     }
//                     resolve({
//                         repoPath,
//                         filePath: match.filePath,
//                         mode: PhabricatorMode.Change,
//                         commitID,
//                     })
//                 })
//                 .catch(reject)
//             return
//         }

//         const changesetMatch = PHAB_CHANGESET_REGEX.exec(stateUrl)
//         if (changesetMatch) {
//             const crumbs = document.querySelector('.phui-crumbs-view')
//             if (!crumbs) {
//                 reject(new Error('failed parsing changeset dom'))
//                 return
//             }

//             const [, differentialHref, diffHref] = crumbs.querySelectorAll('a')

//             const differentialMatch = differentialHref.getAttribute('href')!.match(/D(\d+)/)
//             if (!differentialMatch) {
//                 reject(new Error('failed parsing differentialID'))
//                 return
//             }
//             const differentialID = parseInt(differentialMatch[1], 10)

//             const diffMatch = diffHref.getAttribute('href')!.match(/\/differential\/diff\/(\d+)/)
//             if (!diffMatch) {
//                 reject(new Error('failed parsing diffID'))
//                 return
//             }
//             const diffID = parseInt(diffMatch[1], 10)

//             getRepoDetailsFromDifferentialID(differentialID)
//                 .then(({ callsign }) => {
//                     if (!callsign) {
//                         console.error(`callsign not found`)
//                         return null
//                     }

//                     getRepoDetailsFromCallsign(callsign)
//                         .then(({ repoPath }) => {
//                             let baseRev = `phabricator/base/${diffID}`
//                             let headRev = `phabricator/diff/${diffID}`

//                             const maxDiff = getMaxDiffFromTabView()
//                             const diffLanded = isDifferentialLanded()
//                             if (diffLanded && !maxDiff) {
//                                 console.error(
//                                     'looking for the final diff id in the revision contents table failed. expected final row to have the commit in the description field.'
//                                 )
//                                 return null
//                             }

//                             // check if the diff we are viewing is the max diff. if so,
//                             // right is the merged rev into master, and left is master~1
//                             if (diffLanded && maxDiff && diffID === maxDiff.diffID) {
//                                 headRev = maxDiff.revDescription
//                                 baseRev = maxDiff.revDescription.concat('~1')
//                             }

//                             resolve({
//                                 baseRepoPath: repoPath,
//                                 baseRev,
//                                 headRepoPath: repoPath,
//                                 headRev, // This will be blank on GitHub, but on a manually staged instance should exist
//                                 differentialID,
//                                 diffID,
//                                 mode: PhabricatorMode.Differential,
//                             })
//                         })
//                         .catch(reject)
//                 })
//                 .catch(reject)
//             return
//         }

//         resolve(null)
//     })
// }
