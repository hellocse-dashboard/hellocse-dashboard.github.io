// The card of an open pull request on the board of the reviews: its author, title, repository and number, the state of
// its checks, how long it has waited where it stands (in working time, warmer as it waits), its size, who it waits for,
// and where its counterparts on another side stand. The whole card opens its preview (./preview.js; GitHub with a
// modifier key or the middle button). A row of « Pour toi » says the same in two lines.

import { formatDuration, formatLines, formatRelative, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { el, svg } from '../../ui/dom.js'
import { avatarUrl, githubUrl } from '../../ui/github.js'
import { labelList } from './labels.js'
import { openPreview, plainClick } from './preview.js'

/**
 * What the cards need around them: the data, for names and the organization, the person the board is for, every
 * item of the board, for the previews of the counterparts, and what the viewer shows of a card (its size, who it waits
 * for, its other side: all of them without settings), and the order of the cards (the oldest first without one).
 * @typedef {{ reviews: Reviews, me: string | null, items?: ReviewItem[], settings?: import('../../model/review-settings.js').ReviewSettings, order?: 'oldest' | 'newest', layout?: 'grid' | 'list', onLayout?: (layout: 'grid' | 'list') => void }} CardContext
 * @typedef {import('../../model/reviews.js').ReviewItem} ReviewItem
 */

/** @type {(context: CardContext, login: string) => string} */
export const nameOf = (context, login) => context.reviews.names[login] ?? login

/** @type {(context: CardContext, item: { repo: string, number: number }) => string} */
const prUrl = (context, { repo, number }) => githubUrl(`${context.reviews.org}/${encodeURIComponent(repo)}/pull/${number}`)

// The avatar of a person, their name on hover; ringed when it is the person the board is for.
/**
 * @param {CardContext} context
 * @param {string} login
 * @param {number} [size]
 */
export function avatar(context, login, size = 20) {
  return el('img', {
    className: `review-avatar${login === context.me ? ' is-me' : ''}`,
    src: avatarUrl(login, size * 2),
    alt: '',
    title: nameOf(context, login),
    loading: 'lazy',
    width: size,
    height: size,
  })
}

// The state of the checks of the last commit, an icon drawn like GitHub's, its words on hover.
const CHECKS = {
  SUCCESS: { key: 'success', label: t('CI réussie'), paths: [['path', { d: 'M3.5 8.5l3 3 6-7' }]] },
  FAILURE: { key: 'failure', label: t('CI en échec'), paths: [['path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }]] },
  ERROR: { key: 'failure', label: t('CI en erreur'), paths: [['path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }]] },
  PENDING: { key: 'pending', label: t('CI en cours'), paths: [['circle', { cx: 8, cy: 8, r: 4 }]] },
  EXPECTED: { key: 'pending', label: t('CI attendue'), paths: [['circle', { cx: 8, cy: 8, r: 4 }]] },
}
/** @param {CheckState | null} checks */
function checksIcon(checks) {
  const state = checks ? CHECKS[checks] : null
  if (!state) {
    return []
  }
  const icon = svg('svg', { class: `review-checks is-${state.key}`, viewBox: '0 0 16 16', role: 'img', 'aria-label': state.label })
  const title = svg('title')
  title.textContent = state.label
  icon.append(title, ...state.paths.map(([tag, attributes]) => svg(/** @type {string} */ (tag), attributes)))

  return [icon]
}

// The icon of the files a pull request changes: two sheets, drawn with a line in the color of the text.
function filesIcon() {
  const icon = svg('svg', { class: 'review-files-icon', viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  icon.append(svg('path', { d: 'M5.5 2.5h5l3 3v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z' }), svg('path', { d: 'M10.5 2.5v3h3M2.5 5v8.5a1 1 0 0 0 1 1h7' }))

  return icon
}

// How long it has waited where it stands, after its lane, in working time.
/** @type {Record<string, (time: string) => string>} */
const WAITED = {
  review: (time) => t('attend sa review depuis {time}', { time }),
  owners: (time) => t('attend un code owner depuis {time}', { time }),
  changes: (time) => t('changements demandés il y a {time}', { time }),
  ready: (time) => t('approuvée depuis {time}', { time }),
}
const HEAT_LABELS = { fresh: t('récente'), warm: t('attend depuis plus d’un jour ouvré'), late: t('attend depuis plus de trois jours ouvrés') }

/** @param {ReviewItem} item */
function waitedTag(item) {
  if (item.lane === 'drafts') {
    return el('span', { className: 'review-wait', textContent: t('ouvert {time}', { time: formatRelative(new Date(item.createdAt * 60_000).toISOString()) }) })
  }
  if (item.lane === 'forgotten') {
    return el('span', { className: 'review-wait is-late', textContent: t('plus rien {time}', { time: formatRelative(new Date(item.lastAt * 60_000).toISOString()) }) })
  }
  const time = formatDuration(item.waited)

  return el('span', {
    className: `review-wait is-${item.heat}`,
    textContent: `⏱ ${time}`,
    title: `${WAITED[item.lane](time)} (${t('en temps ouvré')}) · ${HEAT_LABELS[item.heat]}`,
  })
}

const KIND_TAGS = { integration: t('intégration'), release: t('release') }

// Someone a pull request waits for: a person (an avatar), a team of code owners (@slug), or a code owner the sync could
// not read.
/**
 * @param {CardContext} context
 * @param {string | null} login
 */
function waiter(context, login) {
  if (login === null) {
    return el('span', { className: 'review-team', textContent: t('un code owner') })
  }

  return login.startsWith('@') ? el('span', { className: 'review-team', textContent: login }) : avatar(context, login)
}

// Who it waits for, after its lane: the reviewers still asked (and those who approved it, when it needs more), the code
// owners, those who asked for changes, those who approved it.
/**
 * @param {CardContext} context
 * @param {ReviewItem} item
 */
export function waitedFor(context, item) {
  /** @type {[string, (string | null)[]][]} */
  const groups =
    item.lane === 'owners'
      ? [[t('code owners'), item.by]]
      : item.lane === 'changes'
        ? [[t('demandés par'), item.by]]
        : item.lane === 'ready'
          ? [[t('approuvée par'), item.by]]
          : [
              [t('relecture demandée à'), item.requestedReviewers],
              ...(item.stance === 'approving' ? /** @type {[string, string[]][]} */ ([[t('approuvée par'), item.by]]) : []),
            ]
  // A draft waits for no one yet.
  if (item.lane === 'drafts') {
    return []
  }
  const shown = groups.filter(([, logins]) => logins.length)
  if (!shown.length) {
    return item.lane === 'review' ? [el('span', { className: 'review-nobody', textContent: t('personne de désigné') })] : []
  }

  return shown.map(([label, logins]) =>
    el('span', { className: 'review-who', title: `${label} ${logins.map((login) => (login === null ? t('un code owner') : nameOf(context, login))).join(', ')}` },
      el('span', { className: 'review-who-label', textContent: label }),
      el('span', { className: 'review-avatars' }, ...logins.map((login) => waiter(context, login))),
    ),
  )
}

// Where its counterparts stand, for a pull request ready or about to be: the side it still waits for stands out.
const SIDE_NAMES = { front: t('le front'), back: t('le back'), mobile: t('le mobile') }
const LINKED = {
  waiting: (side) => t('attend {side}', { side }),
  ready: (side) => t('{side} est prêt aussi', { side }),
  merged: (side) => t('{side} est déjà mergé', { side }),
}
/**
 * @param {CardContext} context
 * @param {ReviewItem} item
 */
function linkedLines(context, item) {
  return item.linked.map((other) => {
    const side = SIDE_NAMES[context.reviews.repos[other.repo]] ?? other.repo
    const link = el('a', { className: 'review-linked-link', href: prUrl(context, other), target: '_blank', rel: 'noopener', textContent: `${other.repo}#${other.number}` })

    return el('p', { className: `review-linked is-${other.state}` }, document.createTextNode(`${LINKED[other.state](side)} · `), link)
  })
}

/**
 * The link of a pull request: its address on GitHub, but a plain click opens its preview.
 * @param {CardContext} context
 * @param {ReviewItem} item
 * @param {{ className: string, textContent: string, title: string }} properties
 */
export function previewLink(context, item, properties) {
  const link = el('a', { ...properties, href: prUrl(context, item), target: '_blank', rel: 'noopener' })
  link.addEventListener('click', (event) => {
    if (plainClick(event)) {
      event.preventDefault()
      openPreview(context, item, link)
    }
  })

  return link
}

/**
 * The card of a pull request on the board.
 * @param {CardContext} context
 * @param {ReviewItem} item
 */
export function reviewCard(context, item) {
  const forMe = context.me !== null && item.author !== context.me && item.requestedReviewers.includes(context.me)
  const mine = item.author === context.me
  const title = previewLink(context, item, { className: 'review-card-title', textContent: item.title ?? `${item.repo}#${item.number}`, title: item.title ?? '' })

  return el(
    'article',
    { className: `review-card is-${item.lane} is-${item.heat}${forMe ? ' is-for-me' : ''}${mine ? ' is-mine' : ''}` },
    el(
      'div',
      { className: 'review-card-top' },
      avatar(context, item.author, 28),
      el(
        'div',
        { className: 'review-card-head' },
        el(
          'p',
          { className: 'review-card-repo' },
          el('span', { textContent: `${item.repo} #${item.number}` }),
          ...(item.hotfix ? [el('span', { className: 'review-tag is-tma', textContent: t('TMA'), title: t('Une PR de TMA : sa branche part de hotfix') })] : []),
          ...(KIND_TAGS[item.kind] ? [el('span', { className: 'review-tag', textContent: KIND_TAGS[item.kind] })] : []),
          ...(forMe ? [el('span', { className: 'review-tag is-for-me', textContent: t('pour toi') })] : []),
          ...(mine ? [el('span', { className: 'review-tag is-mine', textContent: t('à toi') })] : []),
        ),
        title,
        el('p', { className: 'review-card-author', textContent: nameOf(context, item.author) }),
        ...(context.settings?.parts.labels !== false && item.labels.length ? [labelList(item.labels)] : []),
      ),
      ...checksIcon(item.checks),
    ),
    el(
      'div',
      { className: 'review-card-meta' },
      waitedTag(item),
      // The files it changes, when the sync read them and the viewer shows them.
      ...(context.settings?.parts.files !== false && item.files !== null
        ? [el('span', { className: 'review-files', title: t('Fichiers modifiés') }, filesIcon(), document.createTextNode(plural(item.files, 'fichier')))]
        : []),
      // Its size, once the viewer shows it; the lines deleted, when the sync tells them.
      ...(context.settings?.parts.size === false
        ? []
        : [
          el(
            'span',
            { className: 'review-size', title: item.deleted ? t('lignes ajoutées et supprimées') : t('lignes ajoutées') },
            el('span', { className: 'review-added', textContent: `+${formatLines(item.lines)}` }),
            ...(item.deleted ? [el('span', { className: 'review-deleted', textContent: `−${formatLines(item.deleted)}` })] : []),
          ),
          ]),
      ...(context.settings?.parts.waiters === false ? [] : waitedFor(context, item)),
    ),
    ...(context.settings?.parts.linked === false ? [] : linkedLines(context, item)),
  )
}

/**
 * A pull request in a list of « Pour toi »: its author, repository and number, how long it has waited, and its title.
 * @param {CardContext} context
 * @param {ReviewItem} item
 */
export function reviewRow(context, item) {
  const record = context.reviews.pullRequests.find((pr) => pr.repo === item.repo && pr.number === item.number)
  const time = waitedTag(item)

  // The repository, number and time on a line of their own, the title whole under them (two lines at most): a narrow
  // list never cuts it short. The whole row opens the pull request.
  return el(
    'li',
    { className: 'review-row' },
    avatar(context, item.author, 28),
    el(
      'div',
      { className: 'review-row-body' },
      el('p', { className: 'review-row-meta' }, el('span', { className: 'review-row-repo', textContent: `${item.repo} #${item.number}` }), time),
      previewLink(context, item, { className: 'review-row-title', textContent: record?.title ?? `${item.repo}#${item.number}`, title: record?.title ?? '' }),
    ),
  )
}
