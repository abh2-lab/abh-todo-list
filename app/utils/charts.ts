// Small drawing helpers for the charts on the analytics page (SVG, in pixels).

/** Clean whole numbers for an axis, from 0 up to at least `max`: like 0, 2, 4, 6. */
export function axisTicks(max: number, count = 4): number[] {
  const raw = Math.max(1, max) / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  return ticks
}

/** A box with square corners. */
export function boxPath(x: number, y: number, w: number, h: number): string {
  return `M${x},${y}h${w}v${h}h${-w}Z`
}

/** A bar standing on the bottom line: rounded top corners (the end of the bar), square bottom. */
export function barTopPath(x: number, y: number, w: number, h: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, w / 2, h))
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`
}

/** A 1px line looks sharp only on a half pixel. */
export function crisp(v: number): number {
  return Math.round(v) + 0.5
}
