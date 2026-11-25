// The deployed build of the page, where its data lives: an open page reloads itself on a new build.

const RELOAD_STORAGE_KEY = 'github-pr-dashboard:reloaded-build'

// Stamped with the commit by the deploy workflow; the placeholder stays when the site is served locally.
export const PAGE_BUILD = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="build"]'))?.content.replace('__BUILD__', '') || null

// Where the page reads its data (data/): beside it, or on the site its mirror reads them from, from the data-base meta
// the deploy workflow sets on the mirror only (GitHub Pages lets any site read them).
export const DATA_BASE = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="data-base"]'))?.content ?? ''
/** @param {string} file */
export const dataUrl = (file) => `${DATA_BASE}data/${file}`

// An open page reloads itself on a new deploy rather than running old code on new data. The URL changes
// to skip the cached page, and a build is only reloaded for once to never loop on a stale cache.
export function reloadForNewBuild(build) {
  if (!PAGE_BUILD || !build || build === PAGE_BUILD) {
    return false
  }
  try {
    if (sessionStorage.getItem(RELOAD_STORAGE_KEY) === build) {
      return false
    }
    sessionStorage.setItem(RELOAD_STORAGE_KEY, build)
  } catch {
    return false
  }
  location.replace(`${location.pathname}?v=${encodeURIComponent(build)}`)

  return true
}
