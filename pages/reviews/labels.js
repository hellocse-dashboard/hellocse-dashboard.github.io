// The labels of a pull request on the board of the reviews, as GitHub shows them: in their colors, the text dark or
// light after the color. On its card and in its preview.

import { el } from '../../ui/dom.js'

/**
 * The labels of a pull request, in their colors on GitHub, the text dark or light after the color.
 * @param {[name: string, color: string][]} labels
 */
export function labelList(labels) {
  return el(
    'p',
    { className: 'review-labels' },
    ...labels.map(([name, color]) => {
      const hex = /^[0-9a-f]{6}$/i.test(color) ? color : 'cccccc'
      const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16))
      const light = 0.299 * r + 0.587 * g + 0.114 * b > 150

      return el('span', { className: 'review-label', textContent: name, title: name, style: `--label: #${hex}; --label-text: ${light ? '#1a1a1a' : '#ffffff'}` })
    }),
  )
}
