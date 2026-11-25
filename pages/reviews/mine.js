// The « Pour toi » band of the board of the reviews, as « Mes PR » on the dashboard: once a person is picked, what waits on
// them (the reviews asked of them, their pull requests ready to merge, with changes asked, forgotten), then theirs
// blocked by a code owner and their drafts, every list shown, empty or not, and a line of what waits on others; the count
// of what waits in the tab title; and the notifications of what is new there.

import { formatNumber, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { urgentItems } from '../../model/reviews.js'
import { el } from '../../ui/dom.js'
import { nameOf, reviewRow } from './card.js'

/** @typedef {import('./card.js').CardContext} CardContext */
/** @typedef {import('../../model/reviews.js').PersonalLists} PersonalLists */

const NOTIFY_STORAGE_KEY = 'github-pr-dashboard:reviews-notify'
// What the urgent lists held when the tab last looked: a reload notifies what came meanwhile, a new tab nothing of what
// was already there.
const KNOWN_STORAGE_KEY = 'github-pr-dashboard:reviews-known'

// The lists of the band, in its order: what waits on the person, then theirs blocked by a code owner, their drafts.
const LISTS = {
  toReview: { label: t('On attend ta review'), empty: t('Aucune review ne t’attend') },
  ready: { label: t('Tes PR prêtes à merger'), empty: t('Aucune PR prête à merger') },
  changes: { label: t('Changements demandés sur tes PR'), empty: t('Aucun changement demandé') },
  forgotten: { label: t('Tes PR oubliées'), empty: t('Aucune PR oubliée') },
  owners: { label: t('Tes PR bloquées par un code owner'), empty: t('Aucune PR bloquée par un code owner') },
  drafts: { label: t('Tes brouillons'), empty: t('Aucun brouillon') },
}

/**
 * @param {HTMLElement} container
 * @param {CardContext} context
 * @param {PersonalLists | null} lists
 */
export function renderMine(container, context, lists) {
  if (!lists || context.me === null) {
    container.replaceChildren(
      el(
        'div',
        { className: 'review-mine-pick' },
        el('h2', { textContent: t('Qui es-tu ?') }),
        el('p', { textContent: t('Choisis ton nom dans « Affichage », les curseurs en haut à droite : cette page te montre les reviews qu’on t’a demandées, tes PR à merger, à corriger, oubliées, bloquées et tes brouillons.') }),
      ),
    )

    return
  }
  const waiting = urgentItems(lists).length
  const others = lists.open.length
  /** @type {(key: keyof typeof LISTS) => HTMLElement} */
  const list = (key) =>
    el(
      'section',
      { className: `review-mine-list is-${key}` },
      el('h3', {}, el('span', { textContent: LISTS[key].label }), el('span', { className: 'review-count', textContent: formatNumber(lists[key].length) })),
      lists[key].length
        ? el('ul', { className: 'review-rows' }, ...lists[key].map((item) => reviewRow(context, item)))
        : el('p', { className: 'review-empty', textContent: LISTS[key].empty }),
    )
  const forgotten = lists.forgotten.length
  container.replaceChildren(
    el(
      'header',
      { className: 'review-mine-head' },
      el('h2', { textContent: t('Pour toi, {name}', { name: nameOf(context, context.me) }) }),
      el('p', {
        className: 'review-mine-sub',
        textContent: waiting
          ? t('{count} qui t’attendent', { count: plural(waiting, 'PR', 'PR') })
          : t('Rien ne t’attend pour le moment 🎉'),
      }),
    ),
    // Their forgotten pull requests first, as an alert: nobody looks at them any more.
    ...(forgotten
      ? [
          el(
            'section',
            { className: 'review-mine-alert' },
            el(
              'h3',
              {},
              el('span', { className: 'review-forgotten-mark', textContent: '⚠', ariaHidden: 'true' }),
              el('span', {
                textContent: t('{count} : plus aucune review ni commentaire depuis plus de 30 jours. À relancer, ou à fermer.', {
                  count: t(forgotten > 1 ? 'Tu as {count} PR oubliées' : 'Tu as {count} PR oubliée', { count: formatNumber(forgotten) }),
                }),
              }),
            ),
            el('ul', { className: 'review-rows' }, ...lists.forgotten.map((item) => reviewRow(context, item))),
          ),
        ]
      : []),
    el(
      'div',
      { className: 'review-mine-lists' },
      ...(/** @type {(keyof typeof LISTS)[]} */ (Object.keys(LISTS)).filter((key) => key !== 'forgotten' || !forgotten).map(list)),
    ),
    el('p', { className: 'review-mine-others', textContent: t('{count} en attente des autres', { count: plural(others, 'autre PR ouverte', 'autres PR ouvertes') }) }),
  )
}

export const notificationsSupported = () => 'Notification' in window
export function notificationsOn() {
  try {
    return notificationsSupported() && Notification.permission === 'granted' && localStorage.getItem(NOTIFY_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

/** @param {HTMLButtonElement} button */
export function renderNotifyToggle(button) {
  button.hidden = !notificationsSupported()
  if (button.hidden) {
    return
  }
  button.disabled = Notification.permission === 'denied'
  button.setAttribute('aria-pressed', String(notificationsOn()))
  button.title = button.disabled
    ? t('Notifications bloquées par le navigateur')
    : notificationsOn()
      ? t('Ne plus me notifier')
      : t('Me notifier des nouvelles PR qui m’attendent')
}

/** @param {HTMLButtonElement} button */
export async function toggleNotifications(button) {
  let on = false
  if (!notificationsOn()) {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    on = permission === 'granted'
  }
  try {
    if (on) {
      localStorage.setItem(NOTIFY_STORAGE_KEY, 'on')
    } else {
      localStorage.removeItem(NOTIFY_STORAGE_KEY)
    }
  } catch {
    // Storage can be unavailable: notifications only last for this page.
  }
  renderNotifyToggle(button)
}

/** @param {{ list: string, pr: { repo: string, number: number } }} item */
const itemKey = ({ list, pr }) => `${list}:${pr.repo}#${pr.number}`

// The pull requests of the urgent lists that the tab did not know yet notify, one notification for several, unless the
// board is on screen. The first data of a tab, or a person picked anew, notify nothing.
/**
 * @param {CardContext} context
 * @param {PersonalLists | null} lists
 */
export function notifyNewItems(context, lists) {
  const items = lists ? urgentItems(lists) : []
  /** @type {{ me: string | null, items: string[] } | null} */
  let known = null
  try {
    known = JSON.parse(sessionStorage.getItem(KNOWN_STORAGE_KEY) ?? 'null')
    sessionStorage.setItem(KNOWN_STORAGE_KEY, JSON.stringify({ me: context.me, items: items.map(itemKey) }))
  } catch {
    // Without storage, nothing is known: nothing notifies.
  }
  const fresh = known?.me === context.me && Array.isArray(known.items) ? items.filter((item) => !known.items.includes(itemKey(item))) : []
  if (!fresh.length || !notificationsOn() || document.visibilityState === 'visible') {
    return
  }
  const [first] = fresh
  try {
    const notification = new Notification(plural(items.length, 'PR à traiter', 'PR à traiter'), {
      body:
        fresh.length > 1
          ? fresh
              .slice(0, 3)
              .map(({ pr }) => `${pr.repo}#${pr.number}`)
              .join(', ') + (fresh.length > 3 ? '…' : '')
          : t('{pullRequest} de {author}', { pullRequest: `${first.pr.repo}#${first.pr.number}`, author: nameOf(context, first.pr.author) }),
    })
    notification.addEventListener('click', () => {
      window.focus()
      notification.close()
    })
  } catch {
    // A browser that only notifies through a service worker: the tab title still counts them.
  }
}
