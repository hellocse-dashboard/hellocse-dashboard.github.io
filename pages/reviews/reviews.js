// The board of the reviews (« Relectures », reviews.html), for the whole dev team: its lock screen (the team's own
// password), then the board, drawn again with each new data the sync publishes (polled every minute, every 10 s while a
// sync is awaited, as the dashboard does; a quick sync started once the data is older than 5 minutes, ./sync.js), and its
// filters: the person it is for (kept in this browser), only what concerns them, the repositories, a squad, a search. Its
// pages, by their address: « Pour toi », one per side (back, front, mobile, others), the TMA, the forgotten pull requests.

import { language, storeLanguage, t } from '../../lib/i18n.js'
import { formatRelative } from '../../lib/format.js'
import { boardColumns, filterItems, personalLists, repoOptions, reviewItems, urgentItems } from '../../model/reviews.js'
import { reloadForNewBuild } from '../../services/build.js'
import { fetchVersion, forgetReviewsKey, loadReviews, readReviewsKey, unlockReviews } from '../../services/reviews-source.js'
import { $, $$, el } from '../../ui/dom.js'
import { FORGOTTEN_ROUTE, ME_ROUTE, renderForgotten, renderSide, renderSummary, renderTabs, SIDE_ROUTES, TMA_ROUTE } from './board.js'
import { readSettings, visibleTabs } from '../../model/review-settings.js'
import { setupDisplay } from './display.js'
import { setupPreview } from './preview.js'
import { openWelcome, setupWelcome, WELCOME_VERSION } from './welcome.js'
import { setupSettings } from './settings.js'
import { renderRepoFilter, setupRepoFilter } from './repo-filter.js'
import { notificationsOn, notifyNewItems, renderMine, renderNotifyToggle, toggleNotifications } from './mine.js'
import { AUTO_SYNC_MINUTES, autoSync, canSyncNow, nextAutoSyncAt, settleSync, syncNow, syncState } from './sync.js'

/** @typedef {import('../../model/reviews.js').ReviewItem} ReviewItem */

const POLL_INTERVAL_MS = 60_000
// While a sync is awaited, new data is looked for more often.
const SYNC_POLL_INTERVAL_MS = 10_000
// The waiting times and the age of the data move on between two syncs.
const CLOCK_INTERVAL_MS = 30_000
const ME_STORAGE_KEY = 'github-pr-dashboard:reviews-me'
// The person picked on « Mes PR » of the dashboard, in the same browser: the board starts with them.
const DASHBOARD_ME_STORAGE_KEY = 'github-pr-dashboard:me'
const FILTERS_STORAGE_KEY = 'github-pr-dashboard:reviews-filters'
// What the viewer shows of the board (model/review-settings.js), set behind the sliders of its head.
const SETTINGS_STORAGE_KEY = 'github-pr-dashboard:reviews-settings'
// The version of the welcome this browser saw (pages/reviews/welcome.js): until it is the current one, the welcome
// shows on arrival, to everyone.
const WELCOMED_STORAGE_KEY = 'github-pr-dashboard:reviews-welcomed'
// The viewer's favorite repositories, picked in the settings: saving them applies them at once to the repository filter.
const FAVORITES_STORAGE_KEY = 'github-pr-dashboard:reviews-favorites'
const THEME_STORAGE_KEY = 'github-pr-dashboard:theme'

/** @type {(key: string) => string | null} */
function stored(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
/** @type {(key: string, value: string | null) => void} */
function store(key, value) {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // Storage can be unavailable (private browsing): the choice lasts for this page.
  }
}

const savedFilters = (() => {
  try {
    return JSON.parse(stored(FILTERS_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
})()

const board = {
  /** @type {CryptoKey | null} */
  key: null,
  /** @type {Reviews | null} */
  reviews: null,
  me: stored(ME_STORAGE_KEY) ?? stored(DASHBOARD_ME_STORAGE_KEY),
  /** @type {string | null} */
  squad: typeof savedFilters.squad === 'string' ? savedFilters.squad : null,
  mine: savedFilters.mine === true,
  // The order of the cards: the oldest first (those waiting the longest), or the newest.
  /** @type {'oldest' | 'newest'} */
  order: savedFilters.order === 'newest' ? 'newest' : 'oldest',
  // The repositories picked, null for all of them.
  /** @type {Set<string> | null} */
  repos: Array.isArray(savedFilters.repos) ? new Set(savedFilters.repos) : null,
  /** @type {Set<string>} */
  favorites: (() => {
    try {
      const saved = JSON.parse(stored(FAVORITES_STORAGE_KEY) ?? '[]')

      return new Set(Array.isArray(saved) ? saved.filter((repo) => typeof repo === 'string') : [])
    } catch {
      return new Set()
    }
  })(),
  query: '',
  settings: readSettings((() => {
    try {
      return JSON.parse(stored(SETTINGS_STORAGE_KEY) ?? 'null')
    } catch {
      return null
    }
  })()),
}

function showLock(message = '') {
  $('[data-reviews]').hidden = true
  $('[data-reviews-lock]').hidden = false
  const error = $('[data-reviews-lock-error]')
  error.textContent = message
  error.hidden = !message
  $('[data-reviews-password]').focus()
}

const LOCK_MESSAGES = {
  wrong: t('Mot de passe incorrect.'),
  missing: t('Le tableau des relectures n’est pas encore publié : reviens un peu plus tard.'),
  unavailable: t('Données indisponibles pour le moment, réessaie dans un instant.'),
}

// The tabs that show: those the viewer switched on, the sides only when the board has them.
/** @param {Category[]} sides the sides with a page */
const shownTabs = (sides) => visibleTabs(board.settings, [ME_ROUTE, TMA_ROUTE, FORGOTTEN_ROUTE, ...sides.map((side) => SIDE_ROUTES[side])].map((key) => /** @type {import('../../model/review-settings.js').TabKey} */ (key)))

// The page the address asks for, among the tabs that show: « Pour toi » by default once a person is picked, else the
// first side shown.
/** @param {Category[]} sides the sides with a page */
function currentRoute(sides) {
  const asked = location.hash.replace(/^#\/?/, '')
  const routes = shownTabs(sides)
  const firstSide = routes.find((key) => key !== ME_ROUTE && key !== TMA_ROUTE && key !== FORGOTTEN_ROUTE)

  return /** @type {string[]} */ (routes).includes(asked) ? asked : board.me && routes.includes(ME_ROUTE) ? ME_ROUTE : (firstSide ?? routes[0])
}

export function render() {
  const reviews = board.reviews
  if (!reviews) {
    return
  }
  const now = Date.now()
  const me = board.me && reviews.team.includes(board.me) ? board.me : null
  const items = reviewItems(reviews, now)
  const context = { reviews, me, items, settings: board.settings, order: board.order }
  // The filters of the lists: the repositories, the squad, the search, only what concerns the person.
  const shown = filterItems(items, reviews, { repos: board.repos, squad: board.squad, query: board.query, mine: board.mine && me !== null, me })
  const lists = me ? personalLists(items, me, now) : null
  const sides = boardColumns(items).map(({ side }) => side)
  const ofSide = (/** @type {Category} */ side, /** @type {ReviewItem[]} */ list) => list.filter((item) => item.side === side)
  // The page of a side leaves the TMA to its own tab.
  const onSide = (/** @type {Category} */ side) => shown.filter((item) => item.side === side && !item.hotfix)
  const route = currentRoute(sides)
  const side = sides.find((other) => SIDE_ROUTES[other] === route) ?? null
  const forgotten = shown.filter((item) => item.lane === 'forgotten')
  const tma = shown.filter((item) => item.hotfix)

  renderSquadPicker(reviews)
  $('[data-reviews-settings-open]').classList.toggle('is-on', board.favorites.size > 0)
  renderTabs($('[data-reviews-tabs]'), {
    route,
    shown: shownTabs(sides),
    sides: sides.map((other) => ({ side: other, items: onSide(other) })),
    waiting: lists ? urgentItems(lists).length : null,
    tma,
    forgotten: forgotten.length,
  })
  $('[data-reviews-me-page]').hidden = route !== ME_ROUTE
  $('[data-reviews-list-page]').hidden = route === ME_ROUTE
  if (route === ME_ROUTE) {
    renderMine($('[data-reviews-mine]'), context, lists)
  } else {
    renderRepoFilter($('[data-reviews-repos]', HTMLDetailsElement), repoOptions(items, reviews), board.repos, board.favorites)
    $('[data-reviews-summary]').hidden = side === null && route !== TMA_ROUTE
    if (route === TMA_ROUTE) {
      renderSummary($('[data-reviews-summary]'), tma, board.settings)
      renderSide($('[data-reviews-board]'), context, 'tma', tma, render, board.settings)
    } else if (side) {
      renderSummary($('[data-reviews-summary]'), onSide(side), board.settings)
      renderSide($('[data-reviews-board]'), context, side, onSide(side), render, board.settings)
    } else {
      renderForgotten(
        $('[data-reviews-board]'),
        context,
        sides.map((other) => ({ side: other, items: ofSide(other, forgotten) })),
      )
    }
    $('[data-reviews-empty]').hidden = side === null || onSide(side).length > 0
  }
  renderSyncLine()
  $('[data-reviews-scope]').hidden = me === null
  for (const button of document.querySelectorAll('[data-reviews-scope] button')) {
    button.setAttribute('aria-pressed', String((button.getAttribute('data-value') === 'mine') === board.mine))
  }
  for (const button of document.querySelectorAll('[data-reviews-order] button')) {
    button.setAttribute('aria-pressed', String(button.getAttribute('data-value') === board.order))
  }
  const waiting = lists ? urgentItems(lists).length : 0
  document.title = waiting ? `(${waiting}) ${t('Relectures')}` : t('Relectures')
  notifyNewItems(context, lists)
}

// When the data was generated, and the automatic sync: on its way, or when the next one starts (every AUTO_SYNC_MINUTES
// while the board shows), or off without a dispatch token.
function renderSyncLine() {
  const line = $('[data-reviews-sync]')
  const reviews = board.reviews
  if (!reviews) {
    return
  }
  const syncing = syncState.awaitedSince !== null
  const next = nextAutoSyncAt(reviews)
  const minutes = next === null ? 0 : Math.ceil((next - Date.now()) / 60_000)
  line.classList.toggle('is-syncing', syncing)
  // The button: only once the data is older than AUTO_SYNC_MINUTES, never while a sync is on its way.
  const button = el('button', {
    type: 'button',
    className: 'reviews-sync-now',
    disabled: !canSyncNow(reviews),
    textContent: syncState.busy ? t('Lancement…') : t('Resynchroniser'),
    title:
      next === null
        ? t('Synchro indisponible : aucun token de dispatch')
        : syncing
          ? t('Une synchro est déjà en cours')
          : canSyncNow(reviews)
            ? t('Lancer une synchro rapide maintenant')
            : t('Les données ont moins de {minutes} minutes : pas besoin de resynchroniser', { minutes: AUTO_SYNC_MINUTES }),
  })
  button.addEventListener('click', async () => {
    const started = syncNow(reviews)
    renderSyncLine()
    await started
    renderSyncLine()
  })
  line.replaceChildren(
    el('span', { textContent: t('Mis à jour {time}', { time: formatRelative(reviews.generatedAt) }), title: new Date(reviews.generatedAt).toLocaleString() }),
    el('span', {
      className: `reviews-auto-sync${syncing ? ' is-syncing' : next === null ? ' is-off' : ''}`,
      title: t('Tant que cette page est affichée, elle lance une synchro rapide dès que ses données ont plus de {minutes} minutes, sauf si une synchro vient d’être lancée, depuis cette page ou le tableau de bord.', { minutes: AUTO_SYNC_MINUTES }),
      textContent: syncing
        ? t('Synchro en cours…')
        : next === null
          ? t('Synchro auto désactivée')
          : `${t('Synchro auto toutes les {minutes} min', { minutes: AUTO_SYNC_MINUTES })} · ${
              minutes <= 1 ? t('la prochaine dans moins d’une minute') : t('la prochaine dans {minutes} min', { minutes })
            }`,
    }),
    ...(next === null ? [] : [button]),
    ...(syncState.failed ? [el('span', { className: 'reviews-sync-error', textContent: t('La synchro n’a pas pu être lancée : le token est peut-être expiré.') })] : []),
  )
}

// Starts a quick sync when the data is old, then says so.
async function keepFresh() {
  if (board.reviews) {
    await autoSync(board.reviews, { background: notificationsOn() && board.me !== null })
    renderSyncLine()
  }
}

// The squad picker of the toolbar, with the squads of the data.
/** @param {Reviews} reviews */
function renderSquadPicker(reviews) {
  const squads = $('[data-reviews-squad]', HTMLSelectElement)
  squads.hidden = !reviews.squads.length
  squads.replaceChildren(new Option(t('Toutes les squads'), ''), ...reviews.squads.map((squad) => new Option(squad.name, squad.name)))
  squads.value = reviews.squads.some((squad) => squad.name === board.squad) ? (board.squad ?? '') : ''
}

const storeFilters = () =>
  store(FILTERS_STORAGE_KEY, JSON.stringify({ squad: board.squad, mine: board.mine, repos: board.repos && [...board.repos], order: board.order }))

// The people still in the team, by name: whom the board can be for.
/** @returns {{ login: string, name: string }[]} */
function teamByName() {
  const reviews = board.reviews
  if (!reviews) {
    return []
  }

  return reviews.team
    .map((login) => ({ login, name: reviews.names[login] ?? login }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
}

function show() {
  $('[data-reviews-lock]').hidden = true
  $('[data-reviews]').hidden = false
  render()
  // On arrival, until this browser saw the current version of the welcome: the welcome.
  const reviews = board.reviews
  if (reviews && stored(WELCOMED_STORAGE_KEY) !== String(WELCOME_VERSION) && !$('[data-reviews-welcome]', HTMLDialogElement).open) {
    openWelcome({
      team: teamByName(),
      me: board.me && reviews.team.includes(board.me) ? board.me : null,
      settings: board.settings,
    })
  }
}

// Only the small version file is polled: the board, larger, is downloaded when it changes.
async function refresh() {
  if (!board.key) {
    return
  }
  const version = await fetchVersion()
  if (version && reloadForNewBuild(version.build)) {
    return
  }
  let newData = false
  if (version && version.generatedAt !== board.reviews?.generatedAt) {
    const result = await loadReviews(board.key)
    if ('reviews' in result) {
      board.reviews = result.reviews
      newData = true
    } else if (result.error === 'wrong') {
      lock(t('Le mot de passe a changé : saisis le nouveau.'))

      return
    }
  }
  settleSync(newData)
  if (newData) {
    render()
  }
  await keepFresh()
}

/** @param {string} [message] */
function lock(message) {
  forgetReviewsKey()
  board.key = null
  board.reviews = null
  document.title = t('Relectures')
  showLock(message)
}

function toggleTheme() {
  const root = document.documentElement
  const dark = (root.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
  root.dataset.theme = dark ? 'light' : 'dark'
  store(THEME_STORAGE_KEY, root.dataset.theme)
}

// The language buttons (the head, the lock screen) read the language they switch to; the page loads again in it.
function setupLanguage() {
  const label = language === 'en' ? t('Passer en français') : t('Passer en anglais')
  for (const button of $$('[data-reviews-language]', HTMLButtonElement)) {
    button.textContent = button.classList.contains('reviews-language-link') ? label : language === 'en' ? 'FR' : 'EN'
    button.setAttribute('aria-label', label)
    button.title = label
    button.addEventListener('click', () => {
      storeLanguage(language === 'en' ? 'fr' : 'en')
      location.reload()
    })
  }
}

// Listens to the lock screen, the filters, the notifications, the theme and the language, and polls for new data.
export function setupReviews() {
  setupLanguage()
  $('[data-reviews-lock-form]').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = /** @type {HTMLFormElement} */ (event.currentTarget)
    const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'))
    button.disabled = true
    const result = await unlockReviews(/** @type {HTMLInputElement} */ (form.elements.namedItem('password')).value)
    button.disabled = false
    if ('error' in result) {
      showLock(LOCK_MESSAGES[result.error])

      return
    }
    form.reset()
    board.key = result.key
    board.reviews = result.reviews
    show()
    keepFresh()
  })
  $('[data-reviews-squad]').addEventListener('change', (event) => {
    board.squad = /** @type {HTMLSelectElement} */ (event.target).value || null
    storeFilters()
    render()
  })
  $('[data-reviews-search]').addEventListener('input', (event) => {
    board.query = /** @type {HTMLInputElement} */ (event.target).value
    render()
  })
  $('[data-reviews-order]').addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button')
    if (button) {
      board.order = button.getAttribute('data-value') === 'newest' ? 'newest' : 'oldest'
      storeFilters()
      render()
    }
  })
  $('[data-reviews-scope]').addEventListener('click', (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest('button')
    if (button) {
      board.mine = button.getAttribute('data-value') === 'mine'
      storeFilters()
      render()
    }
  })
  setupRepoFilter(
    $('[data-reviews-repos]', HTMLDetailsElement),
    () => (board.reviews ? repoOptions(reviewItems(board.reviews, Date.now()), board.reviews) : []),
    (repos) => {
      board.repos = repos
      storeFilters()
      render()
    },
    () => board.favorites,
    () => $('[data-reviews-settings-open]').click(),
  )
  setupWelcome({
    settings: () => board.settings,
    // The welcome done, until its next version: its settings and person kept, the board drawn with them, then the
    // favorites when asked.
    onDone: ({ settings, me, favorites }) => {
      store(WELCOMED_STORAGE_KEY, String(WELCOME_VERSION))
      board.settings = settings
      store(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      if (me) {
        board.me = me
        store(ME_STORAGE_KEY, me)
      }
      render()
      if (favorites) {
        $('[data-reviews-settings-open]').click()
      }
    },
  })
  setupDisplay({
    settings: () => board.settings,
    people: () => teamByName(),
    me: () => board.me,
    // The settings saved, and who the viewer is: the board shows them at once, on a tab that still shows.
    onSave: (settings, me) => {
      board.settings = settings
      store(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      board.me = me
      store(ME_STORAGE_KEY, me)
      render()
    },
  })
  setupSettings({
    options: () => (board.reviews ? repoOptions(reviewItems(board.reviews, Date.now()), board.reviews, { withEmpty: true }) : []),
    favorites: () => board.favorites,
    // The favorites saved: the filter keeps to them at once (every repository without any).
    onSave: (favorites) => {
      board.favorites = favorites
      store(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]))
      board.repos = favorites.size ? new Set(favorites) : null
      storeFilters()
      render()
    },
  })
  setupPreview()
  const notify = $('[data-reviews-notify]', HTMLButtonElement)
  notify.addEventListener('click', () => toggleNotifications(notify))
  renderNotifyToggle(notify)
  $('[data-reviews-theme]').addEventListener('click', toggleTheme)
  $('[data-reviews-lock-now]').addEventListener('click', () => {
    if (confirm(t('Verrouiller le tableau des relectures sur cet appareil ?'))) {
      lock()
    }
  })
  // A tab, or an address pasted: its page.
  addEventListener('hashchange', () => {
    render()
    scrollTo({ top: 0 })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh()
    }
  })
  setInterval(refresh, POLL_INTERVAL_MS)
  setInterval(() => syncState.awaitedSince !== null && refresh(), SYNC_POLL_INTERVAL_MS)
  setInterval(render, CLOCK_INTERVAL_MS)
}

// Opens the board with the key this browser kept, else shows the lock screen.
export async function startReviews() {
  const key = await readReviewsKey()
  if (!key) {
    showLock()

    return
  }
  const result = await loadReviews(key)
  if ('error' in result) {
    if (result.error === 'wrong') {
      forgetReviewsKey()
    }
    showLock(result.error === 'wrong' ? t('Le mot de passe a changé : saisis le nouveau.') : LOCK_MESSAGES[result.error])

    return
  }
  board.key = key
  board.reviews = result.reviews
  show()
  keepFresh()
}
