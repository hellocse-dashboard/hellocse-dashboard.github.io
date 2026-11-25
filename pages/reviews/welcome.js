// The welcome of the board of the reviews, on arrival until this browser saw its version (WELCOME_VERSION): who the
// viewer is, their profile (which picks their tabs), what they want to see beyond the simple board, and whether to pick
// their favorite repositories next. It starts from what the viewer already set. « Plus tard » keeps their settings (the
// simple board of a full-stack profile when none); both leave the welcome until its next version: a release that wants
// the whole team to see it again bumps it.

import { t } from '../../lib/i18n.js'
import { defaultSettings, PROFILES } from '../../model/review-settings.js'
import { $, el } from '../../ui/dom.js'

/** @typedef {import('../../model/review-settings.js').ReviewSettings} ReviewSettings */

// The version of the welcome: every browser that has not seen this one sees it on its next visit.
export const WELCOME_VERSION = 1

const PROFILE_LABELS = {
  fullstack: [t('Fullstack'), t('Tous les côtés')],
  back: [t('Back'), t('Les PR back')],
  front: [t('Front'), t('Les PR front')],
  mobile: [t('Mobile'), t('Les PR mobile')],
}
// What the viewer may add to the simple board from the start.
const EXTRAS = [
  { key: 'ready', label: t('Les PR prêtes à merger') },
  { key: 'oubliees', label: t('L’onglet des PR oubliées') },
  { key: 'drafts', label: t('Les brouillons') },
]

/**
 * Opens the welcome, from the viewer's settings so far.
 * @param {{ team: { login: string, name: string }[], me: string | null, settings: ReviewSettings }} welcome
 */
export function openWelcome({ team, me, settings }) {
  const dialog = $('[data-reviews-welcome]', HTMLDialogElement)
  const picker = $('[data-reviews-welcome-me]', HTMLSelectElement)
  picker.replaceChildren(new Option(t('Choisir mon nom'), ''), ...team.map(({ login, name }) => new Option(name, login)))
  picker.value = me ?? ''
  $('[data-reviews-welcome-profiles]').replaceChildren(
    ...PROFILES.map((profile) =>
      el(
        'label',
        { className: 'reviews-welcome-profile' },
        el('input', { type: 'radio', name: 'welcome-profile', value: profile, checked: profile === settings.profile }),
        el('strong', { textContent: PROFILE_LABELS[profile][0] }),
        el('span', { textContent: PROFILE_LABELS[profile][1] }),
      ),
    ),
  )
  $('[data-reviews-welcome-extras]').replaceChildren(
    ...EXTRAS.map(({ key, label }) =>
      el(
        'label',
        { className: 'reviews-settings-repo' },
        el('input', {
          type: 'checkbox',
          name: 'welcome-extra',
          value: key,
          checked: key === 'ready' ? settings.lanes.ready : key === 'oubliees' ? settings.tabs.oubliees : settings.parts.drafts,
        }),
        el('span', { className: 'repo-name', textContent: label }),
      ),
    ),
  )
  dialog.showModal()
}

/**
 * The settings the welcome holds: the viewer's, the tabs of the profile picked when it changed, with what was added.
 * @param {ReviewSettings} current
 * @returns {{ settings: ReviewSettings, me: string | null, favorites: boolean }}
 */
function readWelcome(current) {
  const dialog = $('[data-reviews-welcome]')
  const profile = /** @type {ReviewSettings['profile']} */ (/** @type {HTMLInputElement | null} */ (dialog.querySelector('input[name="welcome-profile"]:checked'))?.value ?? 'fullstack')
  /** @type {ReviewSettings} */
  const settings = structuredClone(current)
  if (profile !== current.profile) {
    settings.profile = profile
    settings.tabs = defaultSettings(profile).tabs
  }
  const extras = new Set([...dialog.querySelectorAll('input[name="welcome-extra"]:checked')].map((input) => /** @type {HTMLInputElement} */ (input).value))
  settings.lanes.ready = extras.has('ready')
  settings.tabs.oubliees = extras.has('oubliees')
  settings.parts.drafts = extras.has('drafts')

  return {
    settings,
    me: $('[data-reviews-welcome-me]', HTMLSelectElement).value || null,
    favorites: $('[data-reviews-welcome-favorites]', HTMLInputElement).checked,
  }
}

/**
 * Listens to the welcome: « C’est parti » keeps what it holds, « Plus tard » the viewer's settings as they were; then
 * the favorites, when asked.
 * @param {{ settings: () => ReviewSettings, onDone: (done: { settings: ReviewSettings, me: string | null, favorites: boolean }) => void }} welcome
 */
export function setupWelcome({ settings, onDone }) {
  const dialog = $('[data-reviews-welcome]', HTMLDialogElement)
  $('[data-reviews-welcome-form]').addEventListener('submit', (event) => {
    const later = /** @type {SubmitEvent} */ (event).submitter?.getAttribute('value') === 'later'
    onDone(later ? { settings: settings(), me: null, favorites: false } : readWelcome(settings()))
  })
  // Escape, as « Plus tard ».
  dialog.addEventListener('cancel', () => onDone({ settings: settings(), me: null, favorites: false }))
}
