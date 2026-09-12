/**
 * رياضيات الرسوم البيانية — SVG خام بلا مكتبة.
 * كل الدوال هنا خالصة حتى تُختبر بالعين على القيم مباشرة.
 */

export interface Margin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Point {
  x: number
  y: number
}

/** سلسلة زمنية لكيان واحد. */
export interface Series {
  id: string
  name: string
  points: Array<{ t: number; v: number }>
}

/**
 * محور أفقي يحترم اتجاه الصفحة: في RTL يمضي الزمن من اليمين لليسار،
 * تماماً كما يُقرأ باقي التخطيط.
 */
export function makeXScale(
  domain: [number, number],
  range: [number, number],
  rtl: boolean,
) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => {
    const ratio = (value - d0) / span
    return rtl ? r1 - ratio * (r1 - r0) : r0 + ratio * (r1 - r0)
  }
}

/**
 * محور رأسي: القيم الأكبر أعلى.
 * `range` يُمرَّر بترتيب [أسفل، أعلى] بالبكسل — أي [y1, y0] — لأن محور SVG
 * يزداد نزولاً بينما القيم تزداد صعوداً.
 */
export function makeYScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [bottom, top] = range
  const span = d1 - d0 || 1
  return (value: number) => bottom - ((value - d0) / span) * (bottom - top)
}

/**
 * سلّم محور بأرقام نظيفة: يُرجع العلامات وحدّها الأعلى معاً.
 * حسابهما في نداء واحد يمنع الخطأ الذي يقع حين يُعاد حساب الخطوة على قيمة
 * مُقرَّبة سلفاً فتخرج شبكة أخشن من المطلوب.
 */
export function niceScale(max: number, count = 4): { ticks: number[]; top: number } {
  if (!(max > 0)) return { ticks: [0], top: 1 }
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const step = (normalized >= 5 ? 10 : normalized >= 2 ? 5 : normalized >= 1 ? 2 : 1) * magnitude
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step * 0.001; v += step) ticks.push(Number(v.toPrecision(12)))
  return { ticks, top }
}

/** مسار خطي مستقيم — بلا تنعيم، فالتنعيم يخترع قيماً بين النقاط. */
export function linePath(points: Point[]): string {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

/**
 * مستطيل بطرف بيانات مستدير 4px وقاعدة قائمة.
 * `flip` لقضبان تنمو نحو اليسار (وضع RTL).
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
  flip = false,
): string {
  const r = Math.max(0, Math.min(radius, width, height / 2))
  if (r === 0 || width <= 0) return `M${x},${y}h${width}v${height}h${-width}z`
  return flip
    ? // ينمو لليسار: الطرف المستدير على اليسار
      `M${x + width},${y} h${-(width - r)} a${r},${r} 0 0 0 ${-r},${r} v${height - 2 * r} a${r},${r} 0 0 0 ${r},${r} h${width - r} z`
    : // ينمو لليمين: الطرف المستدير على اليمين
      `M${x},${y} h${width - r} a${r},${r} 0 0 1 ${r},${r} v${height - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(width - r)} z`
}

/** أقرب نقطة أفقياً — طبقة الالتقاط للـ tooltip. */
export function nearestIndex(values: number[], target: number): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < values.length; i++) {
    const d = Math.abs(values[i] - target)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}
