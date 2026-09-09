export function nearestTarget(origin: DOMRect, candidates: HTMLElement[], key: string) {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
  const x = origin.left + origin.width / 2, y = origin.top + origin.height / 2
  return candidates.map(element => {
    const box = element.getBoundingClientRect()
    const dx = box.left + box.width / 2 - x, dy = box.top + box.height / 2 - y
    const forward = (horizontal ? dx : dy) * sign
    const cross = Math.abs(horizontal ? dy : dx)
    const overlaps = horizontal ? box.bottom > origin.top && box.top < origin.bottom : box.right > origin.left && box.left < origin.right
    return { element, score: forward > 2 ? forward + cross * 3 + (overlaps ? 0 : 1000) : Infinity }
  }).sort((a, b) => a.score - b.score).find(item => Number.isFinite(item.score))?.element
}
