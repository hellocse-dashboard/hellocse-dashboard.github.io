// The pill of a segmented control of the board of the reviews (its tabs, its scope, its order): one element that glides
// from the segment picked before to the one picked now, rather than each segment lighting up on its own. It stays in its
// control across redraws, so that it glides from where it was; placed at once the first time.

import { el } from '../../ui/dom.js'

/**
 * Moves the pill of a control under its current segment, hidden without one.
 * @param {HTMLElement} control
 * @param {HTMLElement | null} current
 */
export function moveIndicator(control, current) {
  let indicator = /** @type {HTMLElement | null} */ (control.querySelector(':scope > .segment-indicator'))
  const placed = indicator !== null
  if (!indicator) {
    indicator = el('span', { className: 'segment-indicator', ariaHidden: 'true' })
    control.prepend(indicator)
  }
  if (!current || current.offsetWidth === 0) {
    indicator.hidden = true

    return
  }
  const wasHidden = indicator.hidden
  indicator.hidden = false
  if (!placed || wasHidden) {
    indicator.style.transition = 'none'
  }
  indicator.style.width = `${current.offsetWidth}px`
  indicator.style.height = `${current.offsetHeight}px`
  indicator.style.transform = `translate(${current.offsetLeft}px, ${current.offsetTop}px)`
  if (!placed || wasHidden) {
    void indicator.offsetWidth
    indicator.style.transition = ''
  }
}

/**
 * The pill of a control whose segments are redrawn: kept aside, to put back first among them.
 * @param {HTMLElement} control
 * @returns {HTMLElement[]}
 */
export const keptIndicator = (control) => {
  const indicator = /** @type {HTMLElement | null} */ (control.querySelector(':scope > .segment-indicator'))

  return indicator ? [indicator] : []
}
