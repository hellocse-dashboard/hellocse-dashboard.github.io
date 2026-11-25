// The pages of the board of the reviews: its tabs (« Pour toi », one per side: back, front, mobile, others, then the
// forgotten ones), the page of a side (its figures, then a kanban of what its pull requests wait for: a review, a code
// owner, changes, a merge, a card per pull request, the longest waiting first; a band that leads to its forgotten ones;
// its drafts, folding away), and the page of the forgotten pull requests of every side. A figure clicked scrolls to its
// lane.

import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { visibleLanes } from '../../model/review-settings.js'
import { boardSummary, LANES } from '../../model/reviews.js'
import { el, svg } from '../../ui/dom.js'
import { reviewCard } from './card.js'

/** @typedef {import('./card.js').CardContext} CardContext */
/** @typedef {import('../../model/reviews.js').ReviewItem} ReviewItem */
/** @typedef {import('../../model/reviews.js').Lane} Lane */
/** @typedef {import('../../model/review-settings.js').ReviewSettings} ReviewSettings */
/** @typedef {import('../../model/review-settings.js').TabKey} TabKey */

// The pages of the board, by their address (#/back…): « Pour toi », then the sides.
export const ME_ROUTE = 'pour-toi'
export const FORGOTTEN_ROUTE = 'oubliees'
// Every pull request of the TMA (hotfixes), whatever its side.
export const TMA_ROUTE = 'tma'
/** @type {Record<Category, string>} */
export const SIDE_ROUTES = { back: 'back', front: 'front', mobile: 'mobile', other: 'autres' }
export const SIDE_LABELS = { back: t('Back'), front: t('Front'), mobile: t('Mobile'), other: t('Autres') }

const LANE_LABELS = {
  review: { label: t('À relire'), hint: t('Sans review, en discussion ou pas encore assez approuvées : elles attendent leurs relecteurs') },
  owners: { label: t('Bloquées par un code owner'), hint: t('Un code owner du dépôt ne les a pas encore relues : GitHub bloque le merge') },
  changes: { label: t('Changements demandés'), hint: t('Des changements demandés, ou des remarques en review sans commit depuis : elles attendent leur auteur') },
  ready: { label: t('Prêtes à merger'), hint: t('Approuvées, sans demande de changements en cours : il ne reste qu’à merger') },
  forgotten: { label: t('Oubliées'), hint: t('Plus aucune review ni commentaire depuis plus de 30 jours : à relancer, ou à fermer') },
  drafts: { label: t('Brouillons'), hint: t('Encore en brouillon : elles n’attendent encore personne') },
}
// What an empty lane of the kanban says.
const EMPTY = { review: t('Rien à relire ici 🎉'), owners: t('Aucune'), changes: t('Aucune'), ready: t('Aucune') }

/**
 * The tabs the viewer shows (visibleTabs()): « Pour toi », with what waits on the person in red, then each side with
 * its pull requests to review, the TMA, the forgotten ones.
 * @param {HTMLElement} container
 * @param {{ route: string, shown: TabKey[], sides: { side: Category, items: ReviewItem[] }[], waiting: number | null, tma: ReviewItem[], forgotten: number }} tabs
 */
export function renderTabs(container, { route, shown, sides, waiting, tma, forgotten }) {
  /**
   * @param {string} key
   * @param {string} label
   * @param {HTMLElement[]} badges
   * @param {string} title
   */
  const tab = (key, label, badges, title) =>
    el(
      'a',
      { className: `reviews-tab${key === route ? ' is-current' : ''}`, href: `#/${key}`, title, ...(key === route ? { ariaCurrent: 'page' } : {}) },
      el('span', { textContent: label }),
      ...badges,
    )
  container.replaceChildren(
    ...[
    tab(
      ME_ROUTE,
      t('Pour toi'),
      waiting ? [el('span', { className: 'reviews-tab-badge is-alert', textContent: formatNumber(waiting) })] : [],
      waiting === null ? t('Choisis qui tu es pour voir ce qui t’attend') : t('{count} qui t’attendent', { count: formatNumber(waiting) }),
    ),
    ...sides.map(({ side, items }) => {
      const toReview = items.filter((item) => item.lane === 'review').length

      return tab(
        SIDE_ROUTES[side],
        SIDE_LABELS[side],
        [el('span', { className: `reviews-tab-badge is-${side}`, textContent: formatNumber(toReview) })],
        t('{count} à relire, {total} ouvertes', { count: formatNumber(toReview), total: formatNumber(items.filter((item) => item.lane !== 'drafts').length) }),
      )
    }),
    (() => {
      const toReview = tma.filter((item) => item.lane === 'review').length

      return tab(
        TMA_ROUTE,
        t('TMA'),
        [el('span', { className: 'reviews-tab-badge is-tma', textContent: formatNumber(toReview) })],
        t('Les PR de TMA, tous côtés confondus : {count} à relire, {total} ouvertes', {
          count: formatNumber(toReview),
          total: formatNumber(tma.filter((item) => item.lane !== 'drafts').length),
        }),
      )
    })(),
    tab(
      FORGOTTEN_ROUTE,
      t('Oubliées'),
      forgotten ? [el('span', { className: 'reviews-tab-badge is-forgotten', textContent: formatNumber(forgotten) })] : [],
      t('Plus aucune review ni commentaire depuis plus de 30 jours : à relancer, ou à fermer'),
    ),
    ].filter((link) => shown.includes(/** @type {TabKey} */ ((link.getAttribute('href') ?? '').slice(2)))),
  )
}

// The figures of a side, each the color of its lane; a click scrolls to it.
const SUMMARY = [
  { key: 'review', label: t('À relire') },
  { key: 'waiting', label: t('Attendent depuis plus d’un jour'), lane: 'review' },
  { key: 'owners', label: t('Bloquées par un code owner') },
  { key: 'changes', label: t('Changements demandés') },
  { key: 'ready', label: t('Prêtes à merger') },
  { key: 'forgotten', label: t('Oubliées') },
  { key: 'drafts', label: t('Brouillons') },
]

/**
 * The figures of the lanes and parts the viewer shows.
 * @param {HTMLElement} container
 * @param {ReviewItem[]} items
 * @param {ReviewSettings} settings
 */
export function renderSummary(container, items, settings) {
  const summary = boardSummary(items)
  const lanes = visibleLanes(settings)
  /** @type {(key: string) => boolean} */
  const shows = (key) =>
    key === 'forgotten' ? settings.parts.forgotten : key === 'drafts' ? settings.parts.drafts : lanes.includes(/** @type {import('../../model/review-settings.js').KanbanLane} */ (key === 'waiting' ? 'review' : key))
  container.hidden = !settings.parts.figures
  container.replaceChildren(
    ...SUMMARY.filter(({ key }) => shows(key)).map(({ key, label, lane }) => {
      const figure = el(
        'button',
        { type: 'button', className: `review-figure is-${lane ?? key}${key === 'waiting' ? ' is-alert' : ''}${summary[key] ? '' : ' is-zero'}` },
        el('span', { className: 'review-figure-value', textContent: formatNumber(summary[key]) }),
        el('span', { className: 'review-figure-label', textContent: label }),
      )
      figure.addEventListener('click', () => {
        if (key === 'forgotten') {
          location.hash = `#/${FORGOTTEN_ROUTE}`
        } else {
          document.querySelector(`[data-lane="${lane ?? key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })

      return figure
    }),
  )
}

// The sections the viewer folded under the kanban, by side and lane, kept in this browser.
const FOLDED_STORAGE_KEY = 'github-pr-dashboard:reviews-folded'
/** @type {Set<string>} */
const folded = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_STORAGE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
})()
/** @param {string} key */
function toggleFolded(key) {
  if (folded.has(key)) {
    folded.delete(key)
  } else {
    folded.add(key)
  }
  try {
    localStorage.setItem(FOLDED_STORAGE_KEY, JSON.stringify([...folded]))
  } catch {
    // Storage can be unavailable: the sections fold for this page only.
  }
}

/**
 * @param {Lane} lane
 * @param {number} count
 */
const laneTitle = (lane, count) =>
  el(
    'span',
    { className: 'review-lane-title', title: LANE_LABELS[lane].hint },
    el('span', { className: 'review-lane-dot', ariaHidden: 'true' }),
    el('span', { className: 'review-lane-label', textContent: LANE_LABELS[lane].label }),
    el('span', { className: 'review-count', textContent: formatNumber(count) }),
  )

// The order of the cards of a lane, after their age: since when they stand there (the forgotten ones, since their last
// activity; the drafts, since their opening), the oldest first, or the newest.
/**
 * @param {Lane} lane
 * @param {'oldest' | 'newest'} [order]
 * @returns {(a: ReviewItem, b: ReviewItem) => number}
 */
function byAge(lane, order = 'oldest') {
  /** @type {(item: ReviewItem) => number} */
  const at = lane === 'forgotten' ? (item) => item.lastAt : lane === 'drafts' ? (item) => item.createdAt : (item) => item.since

  return order === 'newest' ? (a, b) => at(b) - at(a) : (a, b) => at(a) - at(b)
}

// The picker of the layout of a kanban of a single lane, at the top right of its lane: its cards in a grid, or in a
// column.
const LAYOUTS = [
  { key: 'grid', label: t('Grille'), paths: ['M2.5 2.5h4.5v4.5h-4.5Z', 'M9 2.5h4.5v4.5h-4.5Z', 'M2.5 9h4.5v4.5h-4.5Z', 'M9 9h4.5v4.5h-4.5Z'] },
  { key: 'list', label: t('Colonne'), paths: ['M2.5 3h11v3h-11Z', 'M2.5 10h11v3h-11Z'] },
]
/** @param {CardContext} context */
function layoutToggle(context) {
  const current = context.layout ?? 'grid'

  return el(
    'div',
    { className: 'review-layout', role: 'group', ariaLabel: t('Disposition') },
    ...LAYOUTS.map(({ key, label, paths }) => {
      const icon = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' })
      icon.append(...paths.map((d) => svg('path', { d })))
      const button = el('button', { type: 'button', title: label, ariaLabel: label, ariaPressed: String(key === current) }, icon)
      button.addEventListener('click', () => context.onLayout?.(/** @type {'grid' | 'list'} */ (key)))

      return button
    }),
  )
}

// The band of a side that has forgotten pull requests: how many, and the way to them.
/** @param {number} count */
function forgottenBand(count) {
  return el(
    'a',
    { className: 'review-forgotten-band', href: `#/${FORGOTTEN_ROUTE}` },
    el('span', { className: 'review-forgotten-mark', textContent: '⚠', ariaHidden: 'true' }),
    el('span', {
      textContent: t('{count} : plus aucune review ni commentaire depuis plus de 30 jours. À relancer, ou à fermer.', {
        count: t(count > 1 ? '{count} PR oubliées' : '{count} PR oubliée', { count: formatNumber(count) }),
      }),
    }),
    el('span', { className: 'review-forgotten-link', textContent: t('Les voir →') }),
  )
}

/**
 * The page of a side, or of the TMA: the kanban, the band of its forgotten pull requests, then its drafts.
 * @param {HTMLElement} container
 * @param {CardContext} context
 * @param {Category | 'tma'} side
 * @param {ReviewItem[]} items the side's, filtered
 * @param {() => void} redraw
 * @param {ReviewSettings} settings the lanes and parts the viewer shows
 */
export function renderSide(container, context, side, items, redraw, settings) {
  const lanes = visibleLanes(settings)
  /** @type {(lane: Lane) => ReviewItem[]} */
  const inLane = (lane) =>
    items
      .filter((item) => item.lane === lane)
      .sort(byAge(lane, context.order))

  const forgotten = inLane('forgotten').length
  container.replaceChildren(
    ...(forgotten && settings.parts.forgotten ? [forgottenBand(forgotten)] : []),
    el(
      'div',
      {
        className: `review-kanban is-${side}${lanes.length === 1 ? ` is-single is-${context.layout ?? 'grid'}` : ''}`,
        style: `--lanes: ${lanes.length}`,
      },
      ...lanes.map((lane) => {
        const cards = inLane(lane)

        return el(
          'section',
          { className: `review-lane is-${lane}` },
          el(
            'header',
            { className: 'review-lane-head' },
            el('div', { className: 'review-lane-top' }, laneTitle(lane, cards.length), ...(lanes.length === 1 ? [layoutToggle(context)] : [])),
            ...(settings.parts.hints ? [el('p', { className: 'review-lane-hint', textContent: LANE_LABELS[lane].hint })] : []),
          ),
          ...(cards.length ? cards.map((item) => reviewCard(context, item)) : [el('p', { className: 'review-empty', textContent: EMPTY[lane] })]),
        )
      }),
    ),
    ...LANES.filter((lane) => lane === 'drafts' && settings.parts.drafts).map((lane) => {
      const cards = inLane(lane)
      const key = `${side}:${lane}`
      const shut = folded.has(key)
      const toggle = el(
        'button',
        { type: 'button', className: 'review-section-toggle', ariaExpanded: String(!shut) },
        laneTitle(lane, cards.length),
        ...(settings.parts.hints ? [el('span', { className: 'review-lane-hint', textContent: LANE_LABELS[lane].hint })] : []),
        el('span', { className: 'review-lane-chevron', ariaHidden: 'true' }),
      )
      toggle.addEventListener('click', () => {
        toggleFolded(key)
        redraw()
      })

      return el(
        'section',
        { className: `review-section is-${lane}${shut ? ' is-folded' : ''}` },
        toggle,
        ...(shut ? [] : [cards.length ? el('div', { className: 'review-grid' }, ...cards.map((item) => reviewCard(context, item))) : el('p', { className: 'review-empty', textContent: t('Aucune') })]),
      )
    }),
  )
  // The lanes say which they are, for the figures that scroll to them.
  for (const section of container.querySelectorAll('.review-lane, .review-section')) {
    const lane = LANES.find((key) => section.classList.contains(`is-${key}`))
    if (lane) {
      section.setAttribute('data-lane', lane)
    }
  }
}

/**
 * The page of the forgotten pull requests: those of every side, side by side, the longest forgotten first.
 * @param {HTMLElement} container
 * @param {CardContext} context
 * @param {{ side: Category, items: ReviewItem[] }[]} sides the forgotten pull requests of each side, filtered
 */
export function renderForgotten(container, context, sides) {
  const shown = sides.filter(({ items }) => items.length)
  container.replaceChildren(
    el(
      'p',
      { className: 'review-forgotten-intro' },
      el('strong', { textContent: t('Plus aucune review ni commentaire depuis plus de 30 jours.') }),
      document.createTextNode(` ${t('À relancer auprès de leurs relecteurs, à reprendre, ou à fermer si elles n’ont plus lieu d’être.')}`),
    ),
    ...(shown.length
      ? shown.map(({ side, items }) =>
          el(
            'section',
            { className: `review-section is-forgotten is-${side}` },
            el('h2', { className: 'review-section-title' }, el('span', { textContent: SIDE_LABELS[side] }), el('span', { className: 'review-count', textContent: formatNumber(items.length) })),
            el('div', { className: 'review-grid' }, ...[...items].sort(byAge('forgotten', context.order)).map((item) => reviewCard(context, item))),
          ),
        )
      : [el('p', { className: 'review-empty', textContent: t('Aucune PR oubliée 🎉') })]),
  )
}
