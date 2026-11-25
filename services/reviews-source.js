// Where the board of the reviews (reviews.html) reads its data, and its key. Published apart from the stats
// (data/reviews.enc.json), encrypted with a key derived from the password of the dev team (REVIEWS_PASSWORD), with a salt
// of its own: the dashboard password never opens it. Once the password is typed, the key (never the password) stays 30
// days in this browser, as the dashboard's does.

import { dataUrl } from './build.js'
import { decryptStats, deriveKey, fromBase64 } from './stats-key.js'

export const REVIEWS_URL = dataUrl('reviews.enc.json')
const VERSION_URL = dataUrl('version.json')
export const REVIEWS_KEY_STORAGE_KEY = 'github-pr-dashboard:reviews-key'
// That this browser opened the board once, its password typed or not: kept for good, even once locked, as the mark of
// the dashboard (UNLOCKED_STORAGE_KEY). A browser with it that never unlocked the dashboard goes back to the board.
export const REVIEWS_VISITED_STORAGE_KEY = 'github-pr-dashboard:reviews-visited'
const KEEP_MS = 30 * 24 * 60 * 60_000

/** @param {ArrayBuffer} bytes */
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))

/**
 * The published board, still encrypted; else why not: none published (missing), or nothing reachable (unavailable).
 * @returns {Promise<{ payload: EncryptedStats } | { error: 'missing' | 'unavailable' }>}
 */
async function fetchPayload() {
  try {
    const response = await fetch(`${REVIEWS_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (response.status === 404) {
      return { error: 'missing' }
    }

    return response.ok ? { payload: await response.json() } : { error: 'unavailable' }
  } catch {
    return { error: 'unavailable' }
  }
}

/**
 * The board, opened with a key; else why not: a key that does not open it (wrong, a password changed since say), none
 * published, or nothing reachable.
 * @param {CryptoKey} key
 * @returns {Promise<{ reviews: Reviews } | { error: 'wrong' | 'missing' | 'unavailable' }>}
 */
export async function loadReviews(key) {
  const fetched = await fetchPayload()
  if ('error' in fetched) {
    return fetched
  }
  const reviews = await decryptStats(fetched.payload, key)

  return reviews ? { reviews } : { error: 'wrong' }
}

/**
 * The board opened with the password typed, and its key, kept 30 days; else why not.
 * @param {string} password
 * @returns {Promise<{ reviews: Reviews, key: CryptoKey } | { error: 'wrong' | 'missing' | 'unavailable' }>}
 */
export async function unlockReviews(password) {
  const fetched = await fetchPayload()
  if ('error' in fetched) {
    return fetched
  }
  const key = await deriveKey(password, fetched.payload)
  const reviews = await decryptStats(fetched.payload, key)
  if (!reviews) {
    return { error: 'wrong' }
  }
  try {
    const raw = toBase64(await crypto.subtle.exportKey('raw', key))
    localStorage.setItem(REVIEWS_KEY_STORAGE_KEY, JSON.stringify({ key: raw, expiresAt: Date.now() + KEEP_MS }))
  } catch {
    // Storage can be unavailable (private browsing): the board stays open until the tab closes.
  }

  return { reviews, key }
}

// The key kept in this browser, while it lasts.
/** @returns {{ key: string, expiresAt: number } | null} */
function storedKey() {
  try {
    const stored = JSON.parse(localStorage.getItem(REVIEWS_KEY_STORAGE_KEY) ?? 'null')

    return stored && stored.expiresAt > Date.now() && typeof stored.key === 'string' ? stored : null
  } catch {
    return null
  }
}

// Marks this browser as one that opened the board: for good, and for the tab too, where a private window refuses the
// lasting storage.
export function markReviewsVisited() {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      storage().setItem(REVIEWS_VISITED_STORAGE_KEY, '1')
    } catch {
      // This storage is unavailable: the other one keeps the mark.
    }
  }
}

/** @param {() => Storage} storage */
function marked(storage) {
  try {
    return storage().getItem(REVIEWS_VISITED_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

// Whether this browser ever opened the board (its mark, or a key kept): the dashboard then sends it there rather than to
// its lock screen, unless it unlocked the dashboard once (app.js).
export function hasVisitedReviews() {
  return marked(() => localStorage) || marked(() => sessionStorage) || storedKey() !== null
}

/** @returns {Promise<CryptoKey | null>} */
export async function readReviewsKey() {
  const stored = storedKey()
  if (!stored) {
    return null
  }
  try {
    return await crypto.subtle.importKey('raw', fromBase64(stored.key), 'AES-GCM', true, ['decrypt'])
  } catch {
    return null
  }
}

export function forgetReviewsKey() {
  try {
    localStorage.removeItem(REVIEWS_KEY_STORAGE_KEY)
  } catch {
    // Nothing was kept.
  }
}

// When the published data was generated, and the build of the deploy, from the small file the sync writes last; null
// when unreachable.
/** @returns {Promise<{ build: string | null, generatedAt: string } | null>} */
export async function fetchVersion() {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })

    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}
