// What the board of the reviews shows, set by the viewer in a dialog behind the sliders of its head
// (model/review-settings.js): who they are (« Pour toi », the notifications), their profile (which picks the tabs of the
// sides at once), the tabs, the lanes of the kanban, the parts of the pages and of the cards; « Par défaut » goes back
// to the simple board of their profile, still theirs.
// Saving applies it at once; the browser keeps it.

import { t } from '../../lib/i18n.js'
import { defaultSettings, KANBAN_LANES, PROFILES, readSettings, TAB_KEYS } from '../../model/review-settings.js'
import { $, el } from '../../ui/dom.js'

/** @typedef {import('../../model/review-settings.js').ReviewSettings} ReviewSettings */

const PROFILE_LABELS = { fullstack: t('Fullstack'), back: t('Back'), front: t('Front'), mobile: t('Mobile') }
const TAB_LABELS = {
  'pour-toi': t('Pour toi'),
  back: t('Back'),
  front: t('Front'),
  mobile: t('Mobile'),
  autres: t('Autres'),
  tma: t('TMA'),
  oubliees: t('Oubliées'),
}
const LANE_LABELS = { review: t('À relire'), owners: t('Bloquées par un code owner'), changes: t('Changements demandés'), ready: t('Prêtes à merger') }
const PAGE_PARTS = {
  figures: t('Les compteurs en haut de page'),
  hints: t('Ce que veut dire chaque colonne'),
  forgotten: t('Le bandeau des PR oubliées'),
  drafts: t('Les brouillons, sous le kanban'),
}
const CARD_PARTS = {
  labels: t('Ses tags (labels GitHub)'),
  files: t('Le nombre de fichiers modifiés'),
  waiters: t('Qui elle attend'),
  size: t('Sa taille, en lignes'),
  linked: t('Où en est l’autre côté (front, back…)'),
}

/**
 * A group of choices.
 * @param {string} legend
 * @param {HTMLElement[]} choices
 */
const group = (legend, choices) => el('fieldset', { className: 'reviews-settings-group' }, el('legend', { textContent: legend }), ...choices)

/**
 * @param {'radio' | 'checkbox'} type
 * @param {string} name
 * @param {string} value
 * @param {string} label
 * @param {boolean} checked
 */
const choice = (type, name, value, label, checked) =>
  el('label', { className: 'reviews-settings-repo' }, el('input', { type, name, value, checked }), el('span', { className: 'repo-name', textContent: label }))

/**
 * The choices of the dialog, from settings: who the viewer is first, among the people of the team.
 * @param {ReviewSettings} settings
 * @param {{ login: string, name: string }[]} people
 * @param {string | null} me
 */
function renderChoices(settings, people, me) {
  const picker = el('select', { className: 'reviews-input', name: 'display-me', ariaLabel: t('Qui es-tu ?') })
  picker.append(new Option(t('Choisir mon nom'), ''), ...people.map(({ login, name }) => new Option(name, login)))
  picker.value = me ?? ''
  $('[data-reviews-display-list]').replaceChildren(
    group(t('Qui es-tu ?'), [picker]),
    group(t('Je suis'), PROFILES.map((profile) => choice('radio', 'profile', profile, PROFILE_LABELS[profile], settings.profile === profile))),
    group(t('Onglets'), TAB_KEYS.map((key) => choice('checkbox', 'tab', key, TAB_LABELS[key], settings.tabs[key]))),
    group(t('Colonnes du kanban'), KANBAN_LANES.map((lane) => choice('checkbox', 'lane', lane, LANE_LABELS[lane], settings.lanes[lane]))),
    group(t('Sur les pages'), Object.entries(PAGE_PARTS).map(([part, label]) => choice('checkbox', 'part', part, label, settings.parts[/** @type {keyof ReviewSettings['parts']} */ (part)]))),
    group(t('Sur chaque PR'), Object.entries(CARD_PARTS).map(([part, label]) => choice('checkbox', 'part', part, label, settings.parts[/** @type {keyof ReviewSettings['parts']} */ (part)]))),
  )
}

// The settings the dialog holds now.
/** @returns {ReviewSettings} */
function readChoices() {
  const dialog = $('[data-reviews-display]')
  /** @type {(name: string) => HTMLInputElement[]} */
  const inputs = (name) => /** @type {HTMLInputElement[]} */ ([...dialog.querySelectorAll(`input[name="${name}"]`)])
  /** @type {(name: string) => Record<string, boolean>} */
  const checked = (name) => Object.fromEntries(inputs(name).map((input) => [input.value, input.checked]))

  return readSettings({
    profile: inputs('profile').find((input) => input.checked)?.value,
    tabs: checked('tab'),
    lanes: checked('lane'),
    parts: checked('part'),
  })
}

/**
 * Listens to the sliders, the dialog and its buttons; saving gives the settings and who the viewer is.
 * @param {{
 *   settings: () => ReviewSettings, people: () => { login: string, name: string }[], me: () => string | null,
 *   onSave: (settings: ReviewSettings, me: string | null) => void,
 * }} display
 */
export function setupDisplay({ settings, people, me, onSave }) {
  const dialog = $('[data-reviews-display]', HTMLDialogElement)
  /** @returns {string | null} */
  const pickedMe = () => /** @type {HTMLSelectElement | null} */ (dialog.querySelector('select[name="display-me"]'))?.value || null
  $('[data-reviews-display-open]').addEventListener('click', () => {
    renderChoices(settings(), people(), me())
    dialog.showModal()
  })
  // A profile picked: the tabs of its sides, at once; the rest stays as set.
  dialog.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target)
    if (input.name === 'profile') {
      const tabs = defaultSettings(/** @type {ReviewSettings['profile']} */ (input.value)).tabs
      for (const tab of /** @type {HTMLInputElement[]} */ ([...dialog.querySelectorAll('input[name="tab"]')])) {
        tab.checked = tabs[/** @type {keyof ReviewSettings['tabs']} */ (tab.value)]
      }
    }
  })
  $('[data-reviews-display-reset]').addEventListener('click', () => renderChoices(defaultSettings(readChoices().profile), people(), pickedMe()))
  $('[data-reviews-display-form]').addEventListener('submit', (event) => {
    if (/** @type {SubmitEvent} */ (event).submitter?.getAttribute('value') === 'save') {
      onSave(readChoices(), pickedMe())
    }
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  })
}
