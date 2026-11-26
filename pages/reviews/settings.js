// The settings of the board of the reviews, behind the gear of its head: the viewer's favorite repositories, picked in a
// dialog (grouped by side, each with its open pull requests, a search to find one), kept in this browser. Each one
// switched on or off applies at once to the repository filter (every repository without any).

import { formatNumber, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { $, el } from '../../ui/dom.js'

/** @typedef {{ repo: string, side: Category, count: number }} RepoOption */

const SIDES = [
  { key: 'back', label: t('Back') },
  { key: 'front', label: t('Front') },
  { key: 'mobile', label: t('Mobile') },
  { key: 'other', label: t('Autres') },
]

/**
 * Opens the dialog with the repositories of the board and the favorites so far.
 * @param {RepoOption[]} options every repository of the board, those without an open pull request at 0
 * @param {Set<string>} favorites
 */
export function openSettings(options, favorites) {
  const dialog = $('[data-reviews-settings]', HTMLDialogElement)
  // A favorite the board no longer knows (no open pull request) stays, among the others.
  const known = new Set(options.map(({ repo }) => repo))
  const all = [...options, ...[...favorites].filter((repo) => !known.has(repo)).map((repo) => ({ repo, side: /** @type {Category} */ ('other'), count: 0 }))]
  $('[data-reviews-settings-list]').replaceChildren(
    ...SIDES.map(({ key, label }) => ({ label, repos: all.filter((option) => option.side === key) }))
      .filter(({ repos }) => repos.length)
      .map(({ label, repos }) =>
        el(
          'fieldset',
          { className: 'reviews-settings-group' },
          el('legend', { textContent: label }),
          ...repos.map(({ repo, count }) =>
            el(
              'label',
              { className: 'reviews-settings-repo' },
              el('input', { type: 'checkbox', name: 'favorite', value: repo, checked: favorites.has(repo) }),
              el('span', { className: 'repo-name', textContent: repo }),
              el('span', { className: 'repo-count', textContent: t(count > 1 ? '{count} PR ouvertes' : '{count} PR ouverte', { count: formatNumber(count) }) }),
            ),
          ),
        ),
      ),
  )
  for (const label of dialog.querySelectorAll('.reviews-settings-repo')) {
    label.setAttribute('data-repo', /** @type {HTMLInputElement} */ (label.querySelector('input')).value)
  }
  const search = $('[data-reviews-settings-search]', HTMLInputElement)
  search.value = ''
  filterList('')
  renderCount()
  dialog.showModal()
}

// The repositories whose name holds the search.
/** @param {string} query */
function filterList(query) {
  const words = query.toLocaleLowerCase('fr').trim()
  for (const label of document.querySelectorAll('[data-reviews-settings] .reviews-settings-repo')) {
    /** @type {HTMLElement} */ (label).hidden = Boolean(words) && !(label.getAttribute('data-repo') ?? '').toLocaleLowerCase('fr').includes(words)
  }
}

// How many favorites are checked, on the save button.
function renderCount() {
  const count = document.querySelectorAll('[data-reviews-settings] input[name="favorite"]:checked').length
  $('[data-reviews-settings-count]').textContent = count ? plural(count, 'favori') : t('Aucun favori')
}

/**
 * Listens to the gear, the dialog's search, its buttons, and saves the favorites checked.
 * @param {{ options: () => RepoOption[], favorites: () => Set<string>, onSave: (favorites: Set<string>) => void }} settings
 */
export function setupSettings({ options, favorites, onSave }) {
  const dialog = $('[data-reviews-settings]', HTMLDialogElement)
  $('[data-reviews-settings-open]').addEventListener('click', () => openSettings(options(), favorites()))
  $('[data-reviews-settings-search]').addEventListener('input', (event) => filterList(/** @type {HTMLInputElement} */ (event.target).value))
  // Any favorite switched on or off applies at once: no button to save.
  const save = () => {
    renderCount()
    onSave(new Set([...dialog.querySelectorAll('input[name="favorite"]:checked')].map((input) => /** @type {HTMLInputElement} */ (input).value)))
  }
  dialog.addEventListener('change', (event) => {
    if (/** @type {HTMLInputElement} */ (event.target).name === 'favorite') {
      save()
    }
  })
  $('[data-reviews-settings-clear]').addEventListener('click', () => {
    for (const input of dialog.querySelectorAll('input[name="favorite"]')) {
      /** @type {HTMLInputElement} */ (input).checked = false
    }
    save()
  })
  // Closes on its backdrop.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  })
}
