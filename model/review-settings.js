// What the board of the reviews shows, as each viewer sets it (kept in their browser): their profile, which picks the
// tabs of the sides (a back-end developer sees the back, a full-stack one every side), the tabs, the lanes of the kanban
// and the parts of its pages and cards. By default the board stays simple, to the essential at a glance: the lanes to
// review, blocked by a code owner and with changes asked, their figures, and who each pull request waits for; the pull
// requests ready to merge, the tab of the forgotten ones, the drafts, the hints of the lanes, the band of the forgotten
// ones, the size of the pull requests and their other side show once asked for. No DOM.

/** @typedef {'fullstack' | 'back' | 'front' | 'mobile'} Profile */
/** @typedef {'pour-toi' | 'back' | 'front' | 'mobile' | 'autres' | 'tma' | 'oubliees'} TabKey */
/** @typedef {'review' | 'owners' | 'changes' | 'ready'} KanbanLane */
/** @typedef {'figures' | 'hints' | 'forgotten' | 'drafts' | 'labels' | 'files' | 'size' | 'waiters' | 'linked'} Part */
/**
 * @typedef {{ profile: Profile, tabs: Record<TabKey, boolean>, lanes: Record<KanbanLane, boolean>, parts: Record<Part, boolean> }}
 *   ReviewSettings
 */

/** @type {Profile[]} */
export const PROFILES = ['fullstack', 'back', 'front', 'mobile']
// The tabs, in the order of the board: the person, the sides, the TMA, the forgotten pull requests.
/** @type {TabKey[]} */
export const TAB_KEYS = ['pour-toi', 'back', 'front', 'mobile', 'autres', 'tma', 'oubliees']
/** @type {KanbanLane[]} */
export const KANBAN_LANES = ['review', 'owners', 'changes', 'ready']
// The parts of the pages (the figures, the hints of the lanes, the band of the forgotten pull requests, the drafts) and
// of the cards (their labels, the files they change, their size in lines, who they wait for, their other side).
/** @type {Part[]} */
export const PARTS = ['figures', 'hints', 'forgotten', 'drafts', 'labels', 'files', 'size', 'waiters', 'linked']

// The tabs of the sides of a profile: one side, or every side for a full-stack developer.
/** @type {Record<Profile, TabKey[]>} */
const PROFILE_SIDES = { fullstack: ['back', 'front', 'mobile', 'autres'], back: ['back'], front: ['front'], mobile: ['mobile'] }
// The tabs every profile sees by default; the forgotten pull requests show once asked for (« Pour toi » lists the
// person's own anyway).
/** @type {TabKey[]} */
const COMMON_TABS = ['pour-toi', 'tma']

/**
 * What a profile sees by default: its sides, the person and the TMA; the kanban without the pull requests ready to
 * merge; its figures, and on a card its labels, the files it changes and who it waits for; nothing more.
 * @param {Profile} [profile]
 * @returns {ReviewSettings}
 */
export function defaultSettings(profile = 'fullstack') {
  const tabs = /** @type {Record<TabKey, boolean>} */ (
    Object.fromEntries(TAB_KEYS.map((key) => [key, COMMON_TABS.includes(key) || PROFILE_SIDES[profile].includes(key)]))
  )

  return {
    profile,
    tabs,
    lanes: { review: true, owners: true, changes: true, ready: false },
    parts: { figures: true, hints: false, forgotten: false, drafts: false, labels: true, files: true, size: false, waiters: true, linked: false },
  }
}

/**
 * The settings kept, read back over the defaults of their profile: an unknown or missing value takes its default, so
 * that settings kept before a new one existed still read.
 * @param {unknown} raw
 * @returns {ReviewSettings}
 */
export function readSettings(raw) {
  const kept = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  const profile = PROFILES.find((one) => one === kept.profile) ?? 'fullstack'
  const defaults = defaultSettings(profile)
  /**
   * @template {string} Key
   * @param {Record<Key, boolean>} base
   * @param {unknown} values
   * @returns {Record<Key, boolean>}
   */
  const merged = (base, values) => {
    const given = values && typeof values === 'object' ? /** @type {Record<string, unknown>} */ (values) : {}

    return /** @type {Record<Key, boolean>} */ (
      Object.fromEntries(Object.entries(base).map(([key, value]) => [key, typeof given[key] === 'boolean' ? given[key] : value]))
    )
  }

  return { profile, tabs: merged(defaults.tabs, kept.tabs), lanes: merged(defaults.lanes, kept.lanes), parts: merged(defaults.parts, kept.parts) }
}

/**
 * The tabs that show, in their order: those switched on, the sides only when the board has them (back and front always,
 * the others with a pull request), and at least one.
 * @param {ReviewSettings} settings
 * @param {TabKey[]} available the tabs of the sides the board has, and the others
 * @returns {TabKey[]}
 */
export function visibleTabs(settings, available) {
  const shown = TAB_KEYS.filter((key) => available.includes(key) && settings.tabs[key])

  return shown.length ? shown : ['pour-toi']
}

// The lanes of the kanban that show, at least one.
/**
 * @param {ReviewSettings} settings
 * @returns {KanbanLane[]}
 */
export function visibleLanes(settings) {
  const shown = KANBAN_LANES.filter((lane) => settings.lanes[lane])

  return shown.length ? shown : ['review']
}
