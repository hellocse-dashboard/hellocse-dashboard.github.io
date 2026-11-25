// The board of the reviews keeps its data fresh as the dashboard does (site/domain/auto-sync.js): once its data is older
// than AUTO_SYNC_AFTER_MS, a board that shows (or one in the background that notifies) starts a quick sync with the
// dispatch token its data carries, unless a run is queued, going, or started within that delay, from any page: the
// dashboard and the board share their runs. One try every AUTO_SYNC_AFTER_MS at most; the age is checked against the
// server's clock. A failure stays silent: the cron and the other pages remain.

import { ACTIVE_RUN_STATUSES, AUTO_SYNC_AFTER_MS, autoSyncAction, dataStale } from '../../domain/auto-sync.js'
import { dispatchSync, recentRuns } from '../../services/github.js'
import { serverNow } from '../../services/stats-source.js'

// A run the board waits for ends with the next data, or after this long if it failed.
const SYNC_TIMEOUT_MS = 6 * 60_000

export const syncState = {
  triedAt: -Infinity,
  busy: false,
  // The last manual sync could not start (expired token, GitHub unreachable).
  failed: false,
  // Since when the board waits for a run it started or found going, null while it waits for none.
  /** @type {number | null} */
  awaitedSince: null,
}

// When the board starts its next quick sync, in milliseconds: once its data is AUTO_SYNC_AFTER_MS old, and no sooner than
// AUTO_SYNC_AFTER_MS after its last try; null without a dispatch token.
/** @param {Reviews} reviews */
export const nextAutoSyncAt = (reviews) =>
  reviews.syncTrigger ? Math.max(Date.parse(reviews.generatedAt), syncState.triedAt) + AUTO_SYNC_AFTER_MS : null

export const AUTO_SYNC_MINUTES = AUTO_SYNC_AFTER_MS / 60_000

// The run awaited ends with new data, or once it took too long.
/** @param {boolean} newData */
export function settleSync(newData) {
  if (syncState.awaitedSince !== null && (newData || Date.now() - syncState.awaitedSince > SYNC_TIMEOUT_MS)) {
    syncState.awaitedSince = null
  }
}

/**
 * Starts a quick sync when the data of the board is old, and says whether a run is now awaited.
 * @param {Reviews} reviews
 * @param {{ background: boolean }} options background: the board may sync from a hidden tab (it notifies)
 */
export async function autoSync(reviews, { background }) {
  const local = Date.now()
  const trigger = reviews.syncTrigger
  if (
    !trigger ||
    (document.visibilityState !== 'visible' && !background) ||
    syncState.busy ||
    syncState.awaitedSince !== null ||
    local - syncState.triedAt < AUTO_SYNC_AFTER_MS ||
    !dataStale(reviews.generatedAt, local)
  ) {
    return
  }
  syncState.busy = true
  try {
    const now = (await serverNow()) * 1000
    if (!dataStale(reviews.generatedAt, now)) {
      return
    }
    syncState.triedAt = local
    const action = autoSyncAction(await recentRuns(trigger), now)
    if (action === 'start') {
      await dispatchSync(trigger, false)
    }
    if (action !== 'skip') {
      syncState.awaitedSince = Date.now()
    }
  } catch {
    // Expired token, GitHub unreachable: the next try comes AUTO_SYNC_AFTER_MS later.
  } finally {
    syncState.busy = false
  }
}

// Whether the button may start a sync now: a token, data older than AUTO_SYNC_AFTER_MS, and no sync on its way.
/** @param {Reviews} reviews */
export const canSyncNow = (reviews) =>
  reviews.syncTrigger !== null && !syncState.busy && syncState.awaitedSince === null && dataStale(reviews.generatedAt, Date.now())

/**
 * The button's quick sync: a run queued or going is waited for, else one starts, whatever the last automatic try.
 * @param {Reviews} reviews
 */
export async function syncNow(reviews) {
  const trigger = reviews.syncTrigger
  if (!trigger || !canSyncNow(reviews)) {
    return
  }
  syncState.busy = true
  syncState.failed = false
  try {
    const running = (await recentRuns(trigger)).some((run) => ACTIVE_RUN_STATUSES.includes(run.status))
    if (!running) {
      await dispatchSync(trigger, false)
    }
    syncState.triedAt = Date.now()
    syncState.awaitedSince = Date.now()
  } catch {
    syncState.failed = true
  } finally {
    syncState.busy = false
  }
}
