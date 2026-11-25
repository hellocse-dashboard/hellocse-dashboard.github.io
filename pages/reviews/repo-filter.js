// The repository filter of the board of the reviews, the dashboard's own look (styles/ui/repo-filter.css): shortcuts by
// side (all, front, back, mobile, others, none) and the viewer's favorites (picked in the settings, ./settings.js), then
// the repositories grouped by side, each with its count of open pull requests, a checkbox for the whole side. Its own,
// the dashboard's being tied to its state.

import { formatNumber } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { el } from '../../ui/dom.js'

/** @typedef {{ repo: string, side: Category, count: number }} RepoOption */

const SIDES = [
  { key: 'front', label: t('Front') },
  { key: 'back', label: t('Back') },
  { key: 'mobile', label: t('Mobile') },
  { key: 'other', label: t('Autres') },
]

/** @type {(selection: Set<string> | null, repo: string) => boolean} */
const picked = (selection, repo) => selection === null || selection.has(repo)
/** @type {(a: Set<string> | null, b: Set<string>) => boolean} */
const sameSet = (a, b) => a !== null && a.size === b.size && [...a].every((repo) => b.has(repo))

/**
 * The name of the summary: the favorites, every repository, none, whole sides, one repository, or how many.
 * @param {RepoOption[]} options
 * @param {Set<string> | null} selection
 * @param {Set<string>} favorites
 */
function labelOf(options, selection, favorites) {
  if (favorites.size && sameSet(selection, favorites)) {
    return t('★ Mes favoris ({count})', { count: formatNumber(favorites.size) })
  }
  const selected = options.filter(({ repo }) => picked(selection, repo))
  if (selected.length === options.length) {
    return t('Tous les dépôts')
  }
  if (!selected.length) {
    return t('Aucun dépôt')
  }
  const whole = SIDES.filter(({ key }) => {
    const ofSide = options.filter((option) => option.side === key)

    return ofSide.length > 0 && ofSide.every(({ repo }) => picked(selection, repo))
  })
  if (whole.reduce((total, { key }) => total + options.filter((option) => option.side === key).length, 0) === selected.length) {
    return whole.map(({ label }) => label).join(' + ')
  }

  return selected.length === 1 ? selected[0].repo : t('{count} dépôts sur {total}', { count: selected.length, total: options.length })
}

/**
 * @param {string} label
 * @param {number} count
 * @param {Record<string, string>} data
 * @param {boolean} checked
 * @param {boolean} [indeterminate]
 */
function checkbox(label, count, data, checked, indeterminate = false) {
  const input = el('input', { type: 'checkbox', checked, indeterminate })
  Object.assign(input.dataset, data)

  return el(
    'label',
    {},
    input,
    el('span', { className: 'repo-name', textContent: label, title: label }),
    el('span', { className: 'repo-count', textContent: formatNumber(count) }),
  )
}

/**
 * Draws the filter in its details element, its panel kept open while it is.
 * @param {HTMLDetailsElement} filter
 * @param {RepoOption[]} options
 * @param {Set<string> | null} selection
 * @param {Set<string>} favorites the viewer's favorite repositories
 */
export function renderRepoFilter(filter, options, selection, favorites) {
  const sides = SIDES.map((side) => ({ ...side, repos: options.filter((option) => option.side === side.key) })).filter(({ repos }) => repos.length)
  const list = filter.querySelector('.repo-filter-list')
  const scrollTop = list?.scrollTop ?? 0
  const preset = (/** @type {string} */ key, /** @type {string} */ label, /** @type {boolean} */ pressed) =>
    el('button', { type: 'button', textContent: label, ariaPressed: String(pressed), value: key })
  const all = options.every(({ repo }) => picked(selection, repo))
  const none = options.every(({ repo }) => !picked(selection, repo))
  const newList = el(
    'ul',
    { className: 'repo-filter-list', ariaLabel: t('Dépôts') },
    ...sides.flatMap(({ key, label, repos }) => {
      const checked = repos.filter(({ repo }) => picked(selection, repo)).length

      return [
        el('li', { className: 'repo-group' }, checkbox(label, repos.reduce((total, { count }) => total + count, 0), { side: key }, checked === repos.length, checked > 0 && checked < repos.length)),
        ...repos.map(({ repo, count }) => el('li', {}, checkbox(repo, count, { repo }, picked(selection, repo)))),
      ]
    }),
  )
  filter.classList.toggle('is-filtered', !all)
  filter.replaceChildren(
    el('summary', { className: 'reviews-input' }, el('span', { className: 'repo-filter-label', textContent: labelOf(options, selection, favorites) })),
    el(
      'div',
      { className: 'repo-filter-panel' },
      el(
        'div',
        { className: 'repo-presets' },
        preset('favorites', t('★ Mes favoris'), favorites.size > 0 && sameSet(selection, favorites)),
        preset('all', t('Tous'), all),
        ...sides.map(({ key, label, repos }) => preset(key, label, !none && options.every(({ repo, side }) => picked(selection, repo) === (side === key)) && repos.length > 0)),
        preset('none', t('Aucun'), none),
      ),
      el('p', { className: 'repo-filter-note', textContent: t('PR ouvertes') }),
      newList,
    ),
  )
  newList.scrollTop = scrollTop
}

/**
 * Listens to the filter: a shortcut or a checkbox gives the new selection (null for every repository); Escape or a click
 * elsewhere closes it.
 * @param {HTMLDetailsElement} filter
 * @param {() => RepoOption[]} options
 * @param {(selection: Set<string> | null) => void} onChange
 * @param {() => Set<string>} favorites the viewer's favorites
 * @param {() => void} pickFavorites the favorites asked while there are none: their settings open
 */
export function setupRepoFilter(filter, options, onChange, favorites, pickFavorites) {
  filter.addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('.repo-presets button')
    if (!(button instanceof HTMLButtonElement)) {
      return
    }
    const key = button.value
    if (key === 'favorites' && !favorites().size) {
      filter.open = false
      pickFavorites()

      return
    }
    onChange(
      key === 'all'
        ? null
        : key === 'favorites'
          ? new Set(favorites())
          : new Set(key === 'none' ? [] : options().filter(({ side }) => side === key).map(({ repo }) => repo)),
    )
  })
  filter.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target)
    const inputs = /** @type {HTMLInputElement[]} */ ([...filter.querySelectorAll('input[data-repo]')])
    if (input.dataset.side) {
      const ofSide = new Set(options().filter(({ side }) => side === input.dataset.side).map(({ repo }) => repo))
      for (const other of inputs) {
        if (ofSide.has(other.dataset.repo ?? '')) {
          other.checked = input.checked
        }
      }
    }
    const checked = inputs.filter((other) => other.checked).map((other) => other.dataset.repo ?? '')
    onChange(checked.length === inputs.length ? null : new Set(checked))
  })
  filter.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && filter.open) {
      filter.open = false
      filter.querySelector('summary')?.focus()
    }
  })
  // The path of the click, not its target: a shortcut clicked draws the panel again, its button no longer in it.
  document.addEventListener('click', (event) => {
    if (filter.open && !event.composedPath().includes(filter)) {
      filter.open = false
    }
  })
}
