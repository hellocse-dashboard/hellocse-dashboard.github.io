// The notifications of the board of the reviews: what waits on a person (the urgent lists of model/reviews.js: the
// reviews asked of them, their pull requests ready to merge, with changes asked, forgotten), one per pull request and
// list, dated when it came there, the newest first; and those the person has not seen yet, which the bell counts.

import { FORGOTTEN_AFTER_DAYS } from '../domain/open-pull-requests.js'
import { URGENT_LISTS } from './reviews.js'

/** @typedef {import('./reviews.js').ReviewItem} ReviewItem */
/** @typedef {import('./reviews.js').PersonalLists} PersonalLists */
/** @typedef {typeof URGENT_LISTS[number]} NotificationKind */
/**
 * A notification: its key (its list and pull request: a pull request that moves to another list notifies again), the
 * list, the pull request, and when it came there, in minutes since the epoch.
 * @typedef {{ key: string, kind: NotificationKind, item: ReviewItem, at: number }} ReviewNotification
 */

/**
 * The notifications of a person, the newest first. A pull request is forgotten from the day it went without anything
 * for FORGOTTEN_AFTER_DAYS; the others came to their list when their stance began.
 * @param {PersonalLists} lists
 * @returns {ReviewNotification[]}
 */
export function notificationsOf(lists) {
  return URGENT_LISTS.flatMap((kind) =>
    lists[kind].map((item) => ({
      key: `${kind}:${item.repo}#${item.number}`,
      kind,
      item,
      at: kind === 'forgotten' ? item.lastAt + FORGOTTEN_AFTER_DAYS * 24 * 60 : item.since,
    })),
  ).sort((a, b) => b.at - a.at || a.key.localeCompare(b.key))
}

/**
 * Those the person has not seen yet.
 * @param {ReviewNotification[]} notifications
 * @param {Set<string>} seen the keys seen
 */
export const unreadNotifications = (notifications, seen) => notifications.filter(({ key }) => !seen.has(key))
