// What the board of the reviews (« Relectures », reviews.html) reads of the data the sync publishes for it: each open pull
// request of the team, its side (the column: back, front…), its lane (what it waits for), how long it has waited there
// in working hours and how late that is; the filters of the board; and what stands for the person who uses it, as on
// « Mes PR ». No DOM.

import { counterpartStates, FORGOTTEN_AFTER_DAYS, openPullRequests, personalQueue } from '../domain/open-pull-requests.js'
import { MINUTE_MS, WORK_DAY_HOURS, workHoursBetween } from '../domain/time.js'

// The board lists releases and integrations too, as « Mes PR » does: they wait for their reviews all the same.
/** @type {PullRequestKind[]} */
export const REVIEW_KINDS = ['code', 'integration', 'release']

// The columns of the board, in its order: back and front always, the others only with a pull request.
/** @type {Category[]} */
export const SIDES = ['back', 'front', 'mobile', 'other']
/** @type {Category[]} */
const ALWAYS_SHOWN = ['back', 'front']

// The lanes of a column, in its order: what waits on its reviewers first (a review, a code owner), then on its author
// (changes asked, a merge), then the forgotten ones, whatever they stand, and the drafts, which wait for no one yet.
/** @typedef {'review' | 'owners' | 'changes' | 'ready' | 'forgotten' | 'drafts'} Lane */
/** @type {Lane[]} */
export const LANES = ['review', 'owners', 'changes', 'ready', 'forgotten', 'drafts']
/** @type {Record<string, Lane>} */
const LANE_OF_STANCE = { waiting: 'review', discussed: 'review', approving: 'review', owners: 'owners', changes: 'changes', approved: 'ready' }

// How late a pull request is where it stands, in working days: fresh under a day, late from three, warm between.
/** @typedef {'fresh' | 'warm' | 'late'} Heat */
export const WARM_AFTER_HOURS = WORK_DAY_HOURS
export const LATE_AFTER_HOURS = 3 * WORK_DAY_HOURS
/** @type {(hours: number) => Heat} */
export const heatOf = (hours) => (hours >= LATE_AFTER_HOURS ? 'late' : hours >= WARM_AFTER_HOURS ? 'warm' : 'fresh')

/** @type {(pr: { repo: string, number: number }) => string} */
const keyOf = (pr) => `${pr.repo}#${pr.number}`

/**
 * Every open pull request of the team, drafts included, with what the board shows of it, the longest waiting first. A
 * draft reads as the others do (openPullRequests() would leave it out), in the drafts lane, its time since its opening.
 * @param {Reviews} reviews
 * @param {number} now milliseconds since the epoch
 */
export function reviewItems(reviews, now) {
  const nowMinutes = now / MINUTE_MS
  const forgottenBefore = nowMinutes - FORGOTTEN_AFTER_DAYS * 24 * 60
  const records = new Map(reviews.pullRequests.map((pr) => [keyOf(pr), pr]))
  const requiredApprovals = reviews.requiredApprovals
  const linked = counterpartStates(reviews.pullRequests, { requiredApprovals })
  const team = new Set(reviews.team)

  const drafts = new Set(reviews.pullRequests.filter((pr) => pr.draft).map(keyOf))
  const asReady = reviews.pullRequests.map((pr) => (pr.draft ? { ...pr, draft: false } : pr))

  return openPullRequests(asReady, { requiredApprovals, kinds: REVIEW_KINDS })
    .filter((pr) => team.has(pr.author))
    .map((pr) => {
      const record = records.get(keyOf(pr))
      const draft = drafts.has(keyOf(pr))
      /** @type {Lane} */
      const lane = draft ? 'drafts' : pr.lastAt <= forgottenBefore ? 'forgotten' : (LANE_OF_STANCE[pr.stance] ?? 'review')
      const waited = workHoursBetween(draft ? pr.createdAt : pr.since, nowMinutes)

      return {
        ...pr,
        side: reviews.repos[pr.repo] ?? 'other',
        lane,
        title: record?.title ?? null,
        // TMA: a hotfix, from a branch named hotfix…, as the TMA page of the dashboard counts it.
        hotfix: record?.hotfix ?? false,
        checks: record?.checks ?? null,
        // How many files it changes, when the sync read it, and its labels on GitHub.
        files: record?.files ?? null,
        labels: record?.labels ?? [],
        // Who reviewed or commented it (not its author): what « not reviewed by me yet » reads.
        reviewers: [...new Set((record?.interventions ?? []).map(([login]) => login))],
        deleted: record?.deleted ?? 0,
        waited,
        heat: heatOf(waited),
        linked: linked(pr),
      }
    })
    .sort((a, b) => a.since - b.since || a.createdAt - b.createdAt)
}

/** @typedef {ReturnType<typeof reviewItems>[number]} ReviewItem */

/**
 * The filters of the board: the repositories picked (null for all of them), the squad of the authors (its name, null for
 * everyone), a search in the titles, repositories, numbers, logins, names and labels, and, for a person, only what concerns them
 * (mine: theirs, or their review asked), or only the pull requests of others they have not reviewed nor commented yet
 * (unreviewed).
 * @typedef {{ repos?: Set<string> | null, squad: string | null, query: string, mine: boolean, unreviewed?: boolean, me: string | null }} ReviewFilters
 */

/**
 * @param {ReviewItem[]} items
 * @param {Reviews} reviews
 * @param {ReviewFilters} filters
 */
export function filterItems(items, reviews, { repos = null, squad, query, mine, unreviewed = false, me }) {
  const members = squad === null ? null : new Set(reviews.squads.find((other) => other.name === squad)?.members ?? [])
  const words = query.toLocaleLowerCase('fr').split(/\s+/).filter(Boolean)
  /** @type {(login: string) => string} */
  const nameOf = (login) => reviews.names[login] ?? login

  return items.filter((item) => {
    if (repos && !repos.has(item.repo)) {
      return false
    }
    if (members && !members.has(item.author)) {
      return false
    }
    if (mine && me !== null && item.author !== me && !item.requestedReviewers.includes(me)) {
      return false
    }
    if (unreviewed && me !== null && (item.author === me || item.reviewers.includes(me))) {
      return false
    }
    const text = [item.title ?? '', item.repo, `#${item.number}`, item.author, nameOf(item.author), ...item.labels.map(([label]) => label)].join(' ').toLocaleLowerCase('fr')

    return words.every((word) => text.includes(word))
  })
}

// The repositories of the filter, by side then the most open pull requests first, each with its side: those with an open
// pull request, or every repository of the data (withEmpty, for the settings), the others at 0.
/**
 * @param {ReviewItem[]} items
 * @param {Reviews} reviews
 * @param {{ withEmpty?: boolean }} [options]
 * @returns {{ repo: string, side: Category, count: number }[]}
 */
export function repoOptions(items, reviews, { withEmpty = false } = {}) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const item of items) {
    counts.set(item.repo, (counts.get(item.repo) ?? 0) + 1)
  }

  return Object.entries(reviews.repos)
    .map(([repo, side]) => ({ repo, side, count: counts.get(repo) ?? 0 }))
    .filter(({ count }) => withEmpty || count > 0)
    .sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || b.count - a.count || a.repo.localeCompare(b.repo))
}

// The columns of the board, each with its lanes: back and front always, the others when they hold a pull request.
/** @param {ReviewItem[]} items */
export function boardColumns(items) {
  return SIDES.filter((side) => ALWAYS_SHOWN.includes(side) || items.some((item) => item.side === side)).map((side) => {
    const ofSide = items.filter((item) => item.side === side)

    return {
      side,
      count: ofSide.length,
      lanes: LANES.map((lane) => ({
        lane,
        items: ofSide
          .filter((item) => item.lane === lane)
          .sort(lane === 'forgotten' ? (a, b) => a.lastAt - b.lastAt : lane === 'drafts' ? (a, b) => a.createdAt - b.createdAt : (a, b) => a.since - b.since),
      })),
    }
  })
}

// The figures above the board: how many pull requests in each lane, and among those waiting for a review, how many for
// longer than a working day.
/** @param {ReviewItem[]} items */
export function boardSummary(items) {
  /** @type {Record<Lane, number>} */
  const lanes = { review: 0, owners: 0, changes: 0, ready: 0, forgotten: 0, drafts: 0 }
  for (const item of items) {
    lanes[item.lane]++
  }

  return { ...lanes, waiting: items.filter((item) => item.lane === 'review' && item.heat !== 'fresh').length, total: items.length - lanes.drafts }
}

// What stands for one person, as on « Mes PR »: the reviews asked of them, then theirs, each in one list only (ready,
// changes asked, forgotten, blocked by code owners, the others), and their drafts. The urgent lists are those waiting on
// them: what the tab title and the notifications count.
export const URGENT_LISTS = /** @type {const} */ (['toReview', 'ready', 'changes', 'forgotten'])

/**
 * @param {ReviewItem[]} items every item of the board, whatever its filters
 * @param {string} me
 * @param {number} now
 */
export function personalLists(items, me, now) {
  const forgottenBefore = now / MINUTE_MS - FORGOTTEN_AFTER_DAYS * 24 * 60
  const queue = personalQueue(
    items.filter((item) => item.lane !== 'drafts'),
    me,
    { forgottenBefore },
  )

  return { ...queue, drafts: items.filter((item) => item.lane === 'drafts' && item.author === me).sort((a, b) => a.createdAt - b.createdAt) }
}

/** @typedef {ReturnType<typeof personalLists>} PersonalLists */

// What waits on the person, each pull request in one list only, as [list, item].
/**
 * @param {PersonalLists} lists
 * @returns {{ list: string, pr: ReviewItem }[]}
 */
export const urgentItems = (lists) => URGENT_LISTS.flatMap((list) => lists[list].map((pr) => ({ list, pr })))
