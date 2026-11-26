// The preview of a pull request on the board of the reviews, in place of GitHub on a plain click (a click with a
// modifier, the middle button or the link's menu still open GitHub): what it is (repository, title, author, kind,
// project, AC, size, checks), where it stands (its lane, since how long in working time, who it waits for, its
// approvals against those merging needs, its requested reviewers, its code owners), its counterparts on another side,
// its figures, its timeline (pullRequestTimeline() of site/domain/timeline.js, the styles of the dashboard's dialog) and
// who intervened. Closes from its button, with Escape or on its backdrop, and gives the focus back.

import { pullRequestTimeline } from '../../domain/timeline.js'
import { dateTimeFormat, formatDuration, formatLines, formatNumber, formatRelative, plural } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import { $, el, svg } from '../../ui/dom.js'
import { avatarUrl, githubUrl } from '../../ui/github.js'
import { ICONS_URL } from '../../ui/icons.js'
import { labelList } from './labels.js'

/**
 * @typedef {import('../../model/reviews.js').ReviewItem} ReviewItem
 * @typedef {{ reviews: Reviews, me: string | null, items?: ReviewItem[] }} PreviewContext
 */

/** @type {(context: PreviewContext, login: string) => string} */
const nameOf = (context, login) => context.reviews.names[login] ?? login
/** @type {(context: PreviewContext, pr: { repo: string, number: number }) => string} */
const prUrl = (context, { repo, number }) => githubUrl(`${context.reviews.org}/${encodeURIComponent(repo)}/pull/${number}`)
/** @param {number} minutes */
const atDate = (minutes) => new Date(minutes * 60_000)

const LANES = {
  review: { label: t('À relire'), who: t('Elle attend ses relecteurs') },
  owners: { label: t('Bloquée par un code owner'), who: t('Elle attend un code owner du dépôt') },
  changes: { label: t('Changements demandés'), who: t('Elle attend son auteur') },
  ready: { label: t('Prête à merger'), who: t('Il ne reste qu’à la merger') },
  forgotten: { label: t('Oubliée'), who: t('Plus aucune review ni commentaire depuis plus de 30 jours') },
  drafts: { label: t('Brouillon'), who: t('Elle n’attend encore personne') },
}
const STANCES = {
  waiting: t('sans review'),
  discussed: t('en discussion'),
  approving: t('approbation incomplète'),
  owners: t('code owner'),
  changes: t('changements demandés'),
  approved: t('approuvée'),
}
const KINDS = { integration: t('intégration'), release: t('release') }
const SIDES = { front: t('Front'), back: t('Back'), mobile: t('Mobile'), other: t('Autres') }
const CHECKS = {
  SUCCESS: ['success', t('CI réussie')],
  FAILURE: ['failure', t('CI en échec')],
  ERROR: ['failure', t('CI en erreur')],
  PENDING: ['pending', t('CI en cours')],
  EXPECTED: ['pending', t('CI attendue')],
}
const STEPS = {
  opened: { label: t('Ouverte'), by: t('par') },
  commented: { label: t('Premier commentaire'), by: t('de') },
  reviewed: { label: t('Première review'), by: t('de') },
  changes: { label: t('Changements demandés'), by: t('par') },
  approved: { label: t('Approuvée'), by: t('par') },
  merged: { label: t('Mergée'), by: t('par') },
  deployed: { label: t('En prod'), by: '' },
  closed: { label: t('Fermée sans merge'), by: '' },
}
const PENDING = { open: t('Toujours ouverte'), draft: t('Toujours en brouillon'), production: t('Pas encore en prod') }
const LINKED = { waiting: t('pas encore prête'), ready: t('prête aussi'), merged: t('déjà mergée') }

/**
 * A person: their avatar and name.
 * @param {PreviewContext} context
 * @param {string | null} login
 */
function person(context, login) {
  if (login === null) {
    return el('span', { className: 'review-person', textContent: t('un code owner') })
  }
  if (login.startsWith('@')) {
    return el('span', { className: 'review-team', textContent: login })
  }

  return el(
    'span',
    { className: `review-person${login === context.me ? ' is-me' : ''}` },
    el('img', { className: 'review-avatar', src: avatarUrl(login, 40), alt: '', width: 20, height: 20, loading: 'lazy' }),
    el('span', { textContent: nameOf(context, login) }),
  )
}

/**
 * A line of what the pull request waits on: its label, then people.
 * @param {PreviewContext} context
 * @param {string} label
 * @param {(string | null)[]} logins
 */
const peopleLine = (context, label, logins) =>
  el('div', { className: 'review-preview-line' }, el('dt', { textContent: label }), el('dd', {}, ...(logins.length ? logins.map((login) => person(context, login)) : [el('span', { className: 'review-nobody', textContent: t('personne') })])))

/**
 * @param {PreviewContext} context
 * @param {ReviewItem} item
 * @param {PullRequestRecord} record
 */
function standing(context, item, record) {
  const approvers = [...new Set(record.interventions.filter(([, , state]) => state === 'APPROVED').map(([login]) => login))]
  const lane = LANES[item.lane]
  const time = item.lane === 'drafts' || item.lane === 'forgotten' ? null : formatDuration(item.waited)

  return el(
    'section',
    { className: `pr-dialog-section review-preview-standing is-${item.lane}` },
    el('h3', { textContent: t('Où elle en est') }),
    el(
      'p',
      { className: 'review-preview-lane' },
      el('span', { className: 'review-lane-dot', ariaHidden: 'true' }),
      el('strong', { textContent: lane.label }),
      document.createTextNode(` · ${lane.who}`),
      ...(record.hotfix ? [el('span', { className: 'review-tag is-tma', textContent: t('TMA') })] : []),
      ...(time ? [el('span', { className: `review-wait is-${item.heat}`, textContent: t('depuis {time} ouvrées', { time }) })] : []),
    ),
    el(
      'dl',
      { className: 'review-preview-people' },
      peopleLine(context, t('Relecture demandée à'), item.requestedReviewers),
      ...(record.codeOwners?.length ? [peopleLine(context, t('Code owners'), record.codeOwners)] : []),
      peopleLine(context, t('Approuvée par ({count} sur {required})', { count: formatNumber(approvers.length), required: formatNumber(context.reviews.requiredApprovals) }), approvers),
      ...(item.stance === 'changes' ? [peopleLine(context, t('Changements demandés par'), item.by)] : []),
    ),
  )
}

/**
 * Its counterparts on another side, each opening its own preview when the board has it.
 * @param {PreviewContext} context
 * @param {ReviewItem} item
 */
function counterparts(context, item) {
  if (!item.linked.length) {
    return []
  }

  return [
    el(
      'section',
      { className: 'pr-dialog-section' },
      el('h3', { textContent: t('L’autre côté') }),
      el(
        'ul',
        { className: 'review-preview-linked' },
        ...item.linked.map((other) => {
          const side = SIDES[context.reviews.repos[other.repo]] ?? other.repo
          const record = context.reviews.pullRequests.find((pr) => pr.repo === other.repo && pr.number === other.number)
          const link = el('a', { href: prUrl(context, other), target: '_blank', rel: 'noopener', textContent: `${other.repo} #${other.number}` })
          const target = context.items?.find((candidate) => candidate.repo === other.repo && candidate.number === other.number)
          if (target) {
            link.addEventListener('click', (event) => {
              if (plainClick(event)) {
                event.preventDefault()
                openPreview(context, target, link)
              }
            })
          }

          return el(
            'li',
            { className: `review-linked is-${other.state}` },
            el('strong', { textContent: side }),
            document.createTextNode(' · '),
            link,
            document.createTextNode(` · ${LINKED[other.state]}`),
            ...(record?.title ? [el('span', { className: 'review-preview-linked-title', textContent: record.title })] : []),
          )
        }),
      ),
    ),
  ]
}

// « Voir sur GitHub » with the GitHub mark, as the pills of the dashboard's dialogs.
/** @param {string} href */
function githubLink(href) {
  const mark = svg('svg', { viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': 'true' })
  mark.append(svg('use', { href: `${ICONS_URL}#github` }))

  return el('a', { className: 'review-github', href, target: '_blank', rel: 'noopener' }, mark, document.createTextNode(t('Voir sur GitHub')))
}

/** @param {MouseEvent} event */
export const plainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

/**
 * Opens the preview of a pull request of the board.
 * @param {PreviewContext} context
 * @param {ReviewItem} item
 * @param {HTMLElement} opener
 */
export function openPreview(context, item, opener) {
  const record = context.reviews.pullRequests.find((pr) => pr.repo === item.repo && pr.number === item.number)
  if (!record) {
    return
  }
  const now = Date.now() / 60_000
  const { steps, pending, people, durations } = pullRequestTimeline(record, now)
  const dialog = $('[data-reviews-preview]', HTMLDialogElement)
  const close = el('button', { type: 'button', className: 'reviews-icon-button pr-dialog-close', title: t('Fermer'), ariaLabel: t('Fermer') })
  const cross = svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' })
  cross.append(svg('path', { d: 'M4 4l8 8M12 4l-8 8' }))
  close.append(cross)
  close.addEventListener('click', () => dialog.close())
  const check = record.checks ? CHECKS[record.checks] : null

  const head = el(
    'header',
    { className: 'pr-dialog-head' },
    el(
      'div',
      { className: 'pr-dialog-tags' },
      el('span', { className: 'pr-dialog-ref', textContent: `${item.repo} #${item.number}` }),
      el('span', { className: `review-tag is-side-${item.side}`, textContent: SIDES[item.side] }),
      ...(KINDS[item.kind] ? [el('span', { className: 'review-tag', textContent: KINDS[item.kind] })] : []),
      ...(record.hotfix ? [el('span', { className: 'review-tag is-tma', textContent: t('TMA'), title: t('Une PR de TMA : sa branche part de hotfix') })] : []),
      ...(record.project ? [el('span', { className: 'review-tag', textContent: t('projet {name}', { name: record.stage ? `${record.project} · ${record.stage}` : record.project }) })] : []),
      ...(record.ac
        ? [
            el('a', {
              className: 'review-tag',
              href: githubUrl(`${context.reviews.org}/${encodeURIComponent(item.repo)}/tree/${record.ac.split('/').map(encodeURIComponent).join('/')}`),
              target: '_blank',
              rel: 'noopener',
              textContent: t('amélioration continue'),
              title: record.ac,
            }),
          ]
        : []),
      ...(item.author === context.me ? [el('span', { className: 'review-tag is-mine', textContent: t('à toi') })] : []),
      ...(context.me !== null && item.author !== context.me && item.requestedReviewers.includes(context.me) ? [el('span', { className: 'review-tag is-for-me', textContent: t('pour toi') })] : []),
    ),
    el('h2', { id: 'reviews-preview-title', className: 'pr-dialog-title', textContent: record.title ?? `${item.repo}#${item.number}` }),
    ...(record.labels?.length ? [labelList(record.labels)] : []),
    el(
      'p',
      { className: 'pr-dialog-meta' },
      person(context, item.author),
      ...(typeof record.files === 'number' ? [el('span', { textContent: plural(record.files, 'fichier modifié', 'fichiers modifiés') })] : []),
      el('span', {}, el('span', { className: 'review-added', textContent: `+${formatLines(record.lines)}` }), ...(record.deleted ? [document.createTextNode(' '), el('span', { className: 'review-deleted', textContent: `−${formatLines(record.deleted)}` })] : []), document.createTextNode(` ${t('lignes')}`)),
      ...(check ? [el('span', { className: `pr-checks is-${check[0]}`, textContent: check[1] })] : []),
    ),
    // GitHub, on a line of its own under what the pull request is, aligned with it.
    el('p', { className: 'review-preview-actions' }, githubLink(prUrl(context, item))),
  )

  const figures = [
    [t('Ouverte'), `${formatRelative(atDate(record.createdAt).toISOString())}`],
    [t('Dernière activité'), formatRelative(atDate(item.lastAt).toISOString())],
    ...(durations.pickup !== null ? [[t('Prise en charge'), formatDuration(durations.pickup)]] : [[t('Prise en charge'), t('pas encore')]]),
    ...(record.lastCommitAt ? [[t('Dernier commit'), formatRelative(atDate(record.lastCommitAt).toISOString())]] : []),
    [t('Interventions'), formatNumber(record.interventions.length)],
  ]

  const timeline = el(
    'ol',
    { className: 'pr-timeline' },
    ...steps.map((step) =>
      el(
        'li',
        { className: `pr-step is-${step.key}` },
        ...(step.wait === null ? [] : [el('p', { className: 'pr-step-wait', textContent: t('{wait} d’attente', { wait: formatDuration(step.wait) }) })]),
        el('span', { className: 'pr-step-dot' }),
        el(
          'div',
          { className: 'pr-step-body' },
          el(
            'p',
            { className: 'pr-step-title' },
            el('strong', { textContent: STEPS[step.key]?.label ?? step.key }),
            ...(step.login && STEPS[step.key]?.by ? [document.createTextNode(` ${STEPS[step.key].by} ${nameOf(context, step.login)}`)] : []),
          ),
          ...(step.at === null ? [] : [el('p', { className: 'pr-step-time', textContent: dateTimeFormat.format(atDate(step.at)) })]),
        ),
      ),
    ),
    ...(pending
      ? [
          el(
            'li',
            { className: `pr-step is-pending is-${pending.key}` },
            el('p', { className: 'pr-step-wait', textContent: t('{wait} d’attente', { wait: formatDuration(pending.wait) }) }),
            el('span', { className: 'pr-step-dot' }),
            el('div', { className: 'pr-step-body' }, el('p', { className: 'pr-step-title' }, el('strong', { textContent: PENDING[pending.key] }))),
          ),
        ]
      : []),
  )
  const interventions = people.length
    ? el(
        'ul',
        { className: 'pr-people' },
        ...people.map((one) =>
          el(
            'li',
            {},
            person(context, one.login),
            el('span', {
              className: 'pr-people-summary',
              textContent:
                [
                  ...(one.approved ? [plural(one.approved, 'approbation')] : []),
                  ...(one.changes ? [plural(one.changes, 'demande de changements', 'demandes de changements')] : []),
                  ...(one.comments ? [plural(one.comments, 'commentaire')] : []),
                ].join(' · ') || t('review'),
            }),
          ),
        ),
      )
    : el('p', { className: 'pr-dialog-note', textContent: t('Aucune intervention d’une autre personne.') })

  $('[data-reviews-preview-card]').replaceChildren(
    close,
    head,
    el(
      'div',
      { className: 'pr-dialog-body' },
      standing(context, item, record),
      ...counterparts(context, item),
      el('dl', { className: 'pr-dialog-figures' }, ...figures.map(([label, value]) => el('div', {}, el('dt', { textContent: label }), el('dd', { textContent: value })))),
      el(
        'section',
        { className: 'pr-dialog-section' },
        el('h3', { textContent: t('Frise') }),
        el('p', { className: 'pr-dialog-note', textContent: t('Attentes en heures ouvrées : du lundi au vendredi, de 9 h à 18 h.') }),
        timeline,
      ),
      el('section', { className: 'pr-dialog-section' }, el('h3', { textContent: t('Interventions') }), interventions),
    ),
  )
  if (dialog.open) {
    close.focus()

    return
  }
  dialog.addEventListener('close', () => opener.isConnected && opener.focus(), { once: true })
  dialog.showModal()
}

// Closes on its backdrop: the card fills the dialog, so only a click there reaches the dialog itself.
export function setupPreview() {
  const dialog = $('[data-reviews-preview]', HTMLDialogElement)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  })
}
