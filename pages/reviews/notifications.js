// The notifications of the board of the reviews, behind the bell of its head (model/review-notifications.js): what waits
// on the viewer, the newest first, a dot on those not seen yet, which the bell counts. Closing the dialog marks them
// seen, the browser keeping which. A click on one opens its preview over the dialog; a switch turns the notifications of
// the browser on (mine.js).

import { formatNumber, formatRelative } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { notificationsOf, unreadNotifications } from '../../model/review-notifications.js'
import { $, el, svg } from '../../ui/dom.js'
import { avatar, nameOf, previewLink, waitedFor } from './card.js'
import { notificationsOn, notificationsSupported, renderNotifyToggle, switchNotifications } from './mine.js'

/** @typedef {import('./card.js').CardContext} CardContext */
/** @typedef {import('../../model/reviews.js').PersonalLists} PersonalLists */
/** @typedef {import('../../model/review-notifications.js').ReviewNotification} ReviewNotification */
/** @typedef {import('../../model/review-notifications.js').NotificationKind} NotificationKind */

// The keys the viewer has seen, for the person they are: another person picked sees all of theirs as new.
const SEEN_STORAGE_KEY = 'github-pr-dashboard:reviews-seen'

// What each kind says, and its mark: an eye to review, a check to merge, a pencil to correct, a clock forgotten.
/** @type {Record<NotificationKind, { says: (author: string) => string, icon: string[] }>} */
const KINDS = {
  toReview: { says: (author) => t('{author} attend ta review', { author }), icon: ['M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z', 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'] },
  ready: { says: () => t('Ta PR est prête à merger'), icon: ['M3 8.5l3 3 7-7'] },
  changes: { says: () => t('Changements demandés sur ta PR'), icon: ['M10.5 2.5l3 3-8 8H2.5v-3Z', 'M9 4l3 3'] },
  forgotten: { says: () => t('Ta PR n’a plus bougé depuis 30 jours'), icon: ['M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'M8 4.5V8l2.5 1.5'] },
}

/** @type {{ context: CardContext | null, notifications: ReviewNotification[] }} */
const shown = { context: null, notifications: [] }

/**
 * @param {string | null} me
 * @returns {Set<string>}
 */
function readSeen(me) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) ?? 'null')

    return new Set(seen?.me === me && Array.isArray(seen.keys) ? seen.keys : [])
  } catch {
    return new Set()
  }
}

// Every notification shown is seen; one gone and come back is new again.
function markSeen() {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify({ me: shown.context?.me ?? null, keys: shown.notifications.map(({ key }) => key) }))
  } catch {
    // Without storage, the bell counts them all again on the next visit.
  }
}

/** @param {NotificationKind} kind */
function kindIcon(kind) {
  const icon = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  icon.append(...KINDS[kind].icon.map((d) => svg('path', { d })))

  return icon
}

/**
 * One notification: its mark, what it says and when, the title of its pull request, which opens its preview.
 * @param {CardContext} context
 * @param {ReviewNotification} notification
 * @param {boolean} unread
 */
function notificationRow(context, { kind, item, at }, unread) {
  return el(
    'li',
    { className: `reviews-notification is-${kind}${unread ? ' is-unread' : ''}` },
    el('span', { className: 'reviews-notification-icon' }, kindIcon(kind)),
    el(
      'div',
      { className: 'reviews-notification-body' },
      el(
        'p',
        { className: 'reviews-notification-says' },
        el('strong', { textContent: KINDS[kind].says(nameOf(context, item.author)) }),
        el('span', { className: 'reviews-notification-when', textContent: formatRelative(new Date(at * 60_000).toISOString()) }),
      ),
      previewLink(context, item, { className: 'reviews-notification-title', textContent: item.title ?? `${item.repo}#${item.number}`, title: item.title ?? '' }),
      // Its repository and number, then who it is about, as on its card: who asked the changes, who approved it, or the
      // author of someone else's pull request.
      el(
        'p',
        { className: 'reviews-notification-repo' },
        ...(kind === 'toReview' ? [avatar(context, item.author, 18)] : []),
        el('span', { textContent: `${item.repo} #${item.number}` }),
        ...(kind === 'changes' || kind === 'ready' ? waitedFor(context, item) : []),
      ),
    ),
    unread ? el('span', { className: 'reviews-notification-dot', title: t('Non lue') }) : el('span'),
  )
}

// The list of the dialog: the notifications of the person, or what to do without a person picked.
function renderList() {
  const { context, notifications } = shown
  const list = $('[data-reviews-notifications-list]')
  const unread = unreadNotifications(notifications, readSeen(context?.me ?? null))
  $('[data-reviews-notifications-summary]').textContent = !context?.me
    ? ''
    : unread.length
      ? t(unread.length > 1 ? '{count} nouvelles' : '{count} nouvelle', { count: formatNumber(unread.length) })
      : t('Tout est lu')
  if (!context?.me) {
    const pick = el('button', { type: 'button', className: 'lock-submit', textContent: t('Choisir mon nom') })
    pick.addEventListener('click', () => {
      $('[data-reviews-notifications]', HTMLDialogElement).close()
      $('[data-reviews-display-open]').click()
    })
    list.replaceChildren(el('div', { className: 'reviews-notifications-empty' }, el('p', { textContent: t('Dis qui tu es pour voir ce qui t’attend : les reviews qu’on te demande, tes PR prêtes ou à corriger.') }), pick))

    return
  }
  const fresh = new Set(unread.map(({ key }) => key))
  list.replaceChildren(
    notifications.length
      ? el('ul', { className: 'reviews-notifications-items' }, ...notifications.map((notification) => notificationRow(context, notification, fresh.has(notification.key))))
      : el('div', { className: 'reviews-notifications-empty' }, el('p', { textContent: t('Rien ne t’attend pour le moment 🎉') })),
  )
}

// The switch of the notifications of the browser, as they are now.
function renderSwitch() {
  const input = $('[data-reviews-notifications-browser]', HTMLInputElement)
  const blocked = notificationsSupported() && Notification.permission === 'denied'
  input.closest('label')?.toggleAttribute('hidden', !notificationsSupported())
  input.checked = notificationsOn()
  input.disabled = blocked
  $('[data-reviews-notifications-blocked]').hidden = !blocked
}

// The count of the bell: the notifications not seen yet; a count that grows pops, once.
function renderBadge() {
  const { context, notifications } = shown
  const count = unreadNotifications(notifications, readSeen(context?.me ?? null)).length
  const badge = $('[data-reviews-notify-count]')
  const was = badge.textContent
  badge.hidden = count === 0
  badge.textContent = count > 99 ? '99+' : formatNumber(count)
  if (count && badge.textContent !== was) {
    badge.classList.remove('is-new')
    void badge.offsetWidth
    badge.classList.add('is-new')
  }
  $('[data-reviews-notify]').setAttribute('aria-label', count ? t('Notifications : {count} non lues', { count: formatNumber(count) }) : t('Notifications'))
}

/**
 * The notifications of the person, from their lists: the count of the bell, and the dialog when it is open.
 * @param {CardContext} context
 * @param {PersonalLists | null} lists
 */
export function renderNotifications(context, lists) {
  shown.context = context
  shown.notifications = lists ? notificationsOf(lists) : []
  renderBadge()
  if ($('[data-reviews-notifications]', HTMLDialogElement).open) {
    renderList()
  }
}

// Listens to the bell, the dialog and its switch.
export function setupNotifications() {
  const dialog = $('[data-reviews-notifications]', HTMLDialogElement)
  const bell = $('[data-reviews-notify]', HTMLButtonElement)
  renderNotifyToggle(bell)
  bell.addEventListener('click', () => {
    renderList()
    renderSwitch()
    dialog.showModal()
    // The dialog takes the focus itself: no notification ringed before a key is pressed.
    dialog.focus()
  })
  dialog.addEventListener('close', () => {
    markSeen()
    renderBadge()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  })
  $('[data-reviews-notifications-browser]', HTMLInputElement).addEventListener('change', async (event) => {
    await switchNotifications(/** @type {HTMLInputElement} */ (event.target).checked)
    renderSwitch()
    renderNotifyToggle(bell)
  })
}
