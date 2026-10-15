/**
 * استوديو الصورة: كل المعالجة في متصفح الإدارة قبل الرفع، فاللوحة بتستلم
 * صورة جاهزة ومتصغّرة وما بتعملش أي فلتر وقت العرض (جهاز التلفزيون ضعيف).
 *
 * الترتيب: مصدر ← خلفية (كما هي / عزل شخص / إزالة لون) ← لون (فلتر) ←
 * لمسة (هالة أو ظل) ← خلفية جديدة ← قصّ على الشخص لو شفاف ← ترميز.
 */

/** أطول ضلع للعمل: أكبر من كده بطيء في العزل ومن غير فايدة على الشاشة. */
export const WORK_EDGE = 1400

export type BackgroundMode = 'keep' | 'person' | 'color'
export type LookId = 'none' | 'bright' | 'warm' | 'gold' | 'cinema' | 'mono'
export type TouchId = 'none' | 'glow' | 'shadow'
export type BackdropId = 'clear' | 'teal' | 'gold' | 'night'
export type TouchColor = 'gold' | 'white' | 'teal'

export const LOOKS: LookId[] = ['none', 'bright', 'warm', 'gold', 'cinema', 'mono']
export const TOUCHES: TouchId[] = ['none', 'glow', 'shadow']
export const BACKDROPS: BackdropId[] = ['clear', 'teal', 'gold', 'night']
export const TOUCH_COLORS: Record<TouchColor, string> = { gold: '#f0d38a', white: '#ffffff', teal: '#5ccfc3' }

/** خلفيات بألوان الهوية — تدرّج دائري ناعم زي سطح شاشة الاحتفال. */
const BACKDROP_STOPS: Record<Exclude<BackdropId, 'clear'>, [string, string, string]> = {
  teal: ['#2aa79b', '#0f7e76', '#0a3f3b'],
  gold: ['#fbe7b2', '#d9ad55', '#7a5a1c'],
  night: ['#1d4d4a', '#0b2627', '#040f10'],
}

export interface StudioOptions {
  background: BackgroundMode
  /** نضافة حافة العزل الذكي (1–4). */
  edge: number
  /** سماحية إزالة اللون (5–60). */
  tolerance: number
  look: LookId
  /** شدّة الفلتر 0–1. */
  amount: number
  touch: TouchId
  touchColor: TouchColor
  backdrop: BackdropId
}

export const DEFAULT_OPTIONS: StudioOptions = {
  background: 'keep',
  edge: 2,
  tolerance: 24,
  look: 'none',
  amount: 0.8,
  touch: 'none',
  touchColor: 'gold',
  backdrop: 'clear',
}

export interface Pixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/**
 * يقرا الصورة لـ canvas متصغّر. الروابط بتتجاب بـ fetch (مسموح لمخزن Supabase)
 * فالـ canvas ما يتقفلش بسبب CORS، والملفات المحلية بتتقري مباشرة.
 */
export async function loadSource(src: Blob | string, maxEdge = WORK_EDGE): Promise<HTMLCanvasElement> {
  const blob = typeof src === 'string' ? await fetch(src).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.blob()
  }) : src
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const c = canvas(bitmap.width * scale, bitmap.height * scale)
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close()
  return c
}

export function pixelsOf(c: HTMLCanvasElement): Pixels {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  return { data: d.data, width: c.width, height: c.height }
}

export function toCanvas(p: Pixels): HTMLCanvasElement {
  const c = canvas(p.width, p.height)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0)
  return c
}

/** نسخة صغيرة للمعاينات المصغّرة (أزرار الفلاتر) — المعالجة عليها لحظية. */
export function shrink(c: HTMLCanvasElement, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(c.width, c.height))
  const out = canvas(c.width * scale, c.height * scale)
  out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height)
  return out
}

/**
 * إزالة خلفية لونها ثابت (شعار على أبيض مثلاً): ملء من حواف الصورة بس، فالأبيض
 * اللي جوّه الشعار نفسه (حروف، أشكال) بيفضل. الحافة بتتدرّج بدل ما تتسنّن.
 */
export function keyOutBackground(src: Pixels, tolerance: number): Pixels {
  const { width, height } = src
  const data = new Uint8ClampedArray(src.data)
  // لون الخلفية: متوسط الأركان الأربعة
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  let r = 0, g = 0, b = 0
  for (const i of corners) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2] }
  r /= 4; g /= 4; b /= 4

  const hard = (tolerance / 100) * 441 // أقصى مسافة لونية = √(3·255²)
  const soft = hard * 1.6
  const dist = (i: number) => Math.hypot(data[i * 4] - r, data[i * 4 + 1] - g, data[i * 4 + 2] - b)

  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const push = (i: number) => { if (!seen[i] && dist(i) < soft) { seen[i] = 1; stack.push(i) } }
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1) }

  while (stack.length) {
    const i = stack.pop()!
    const d = dist(i)
    const a = d <= hard ? 0 : ((d - hard) / (soft - hard)) * 255
    data[i * 4 + 3] = Math.min(data[i * 4 + 3], a)
    // اللي جوّه الحافة الناعمة ما بيكمّلش الملء: يوقف عند حدود الشكل
    if (d > hard) continue
    const x = i % width
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (i >= width) push(i - width)
    if (i < (height - 1) * width) push(i + width)
  }
  return { data, width, height }
}

/** فلاتر لون بسيطة على البكسلات — بتشتغل على كل المتصفحات (canvas.filter مش مدعوم في Safari القديم). */
export function applyLook(src: Pixels, look: LookId, amount: number): Pixels {
  if (look === 'none' || amount <= 0) return src
  const data = new Uint8ClampedArray(src.data)
  const k = Math.min(1, amount)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = data[i], g = data[i + 1], b = data[i + 2]
    const r0 = r, g0 = g, b0 = b
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    switch (look) {
      case 'bright': {
        // أفتح شوية، تشبّع وتباين أعلى: صور المكتب الباهتة بتصحى
        const s = 1.28
        r = lum + (r - lum) * s; g = lum + (g - lum) * s; b = lum + (b - lum) * s
        r = (r - 128) * 1.1 + 140; g = (g - 128) * 1.1 + 140; b = (b - 128) * 1.1 + 140
        break
      }
      case 'warm':
        r = r * 1.08 + 10; g = g * 1.02 + 4; b = b * 0.9
        break
      case 'gold': {
        // درجة ذهبية: الظلال بنّي دافي والإضاءات شمبانيا
        const t = lum / 255
        r = lum * 0.55 + (60 + 190 * t) * 0.45 + 8
        g = lum * 0.55 + (42 + 165 * t) * 0.45
        b = lum * 0.55 + (20 + 110 * t) * 0.45
        break
      }
      case 'cinema': {
        // ظلال تركوازي وإضاءات دافية وتباين أعلى
        const t = lum / 255
        r = (r - 128) * 1.18 + 128 + (t - 0.5) * 26
        g = (g - 128) * 1.18 + 128 + (0.5 - Math.abs(t - 0.5)) * 6
        b = (b - 128) * 1.18 + 128 - (t - 0.5) * 30
        const m = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = m + (r - m) * 0.9; g = m + (g - m) * 0.9; b = m + (b - m) * 0.9
        break
      }
      case 'mono': {
        const v = (lum - 128) * 1.15 + 128
        r = g = b = v
        break
      }
    }
    data[i] = r0 + (r - r0) * k
    data[i + 1] = g0 + (g - g0) * k
    data[i + 2] = b0 + (b - b0) * k
  }
  return { data, width: src.width, height: src.height }
}

/** حدود الجزء الظاهر (alpha > 24)، أو null لو الصورة فاضية. */
function bounds(p: Pixels) {
  let top = p.height, left = p.width, right = -1, bottom = -1
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] > 24) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

export function hasTransparency(p: Pixels) {
  for (let i = 3; i < p.data.length; i += 16) if (p.data[i] < 250) return true
  return false
}

/**
 * التركيب النهائي: لمسة (هالة/ظل بـ shadowBlur — رسم مرة واحدة هنا مش وقت
 * العرض)، والخلفية الجديدة، والقصّ على حدود الشخص لو الناتج شفاف.
 */
export function compose(p: Pixels, o: Pick<StudioOptions, 'touch' | 'touchColor' | 'backdrop'>): HTMLCanvasElement {
  const transparent = hasTransparency(p)
  const box = transparent ? bounds(p) : null
  const src = toCanvas(p)
  const crop = box ?? { left: 0, top: 0, width: p.width, height: p.height }
  const edge = Math.max(crop.width, crop.height)
  // اللمسة محتاجة هامش عشان الهالة ما تتقصّش
  const pad = transparent && o.touch !== 'none' ? Math.round(edge * 0.06) : 0
  const out = canvas(crop.width + pad * 2, crop.height + pad * 2)
  const ctx = out.getContext('2d')!

  if (o.backdrop !== 'clear') {
    const [a, b, c] = BACKDROP_STOPS[o.backdrop]
    const g = ctx.createRadialGradient(out.width / 2, out.height * 0.3, 0, out.width / 2, out.height * 0.45, Math.max(out.width, out.height) * 0.8)
    g.addColorStop(0, a)
    g.addColorStop(0.45, b)
    g.addColorStop(1, c)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, out.width, out.height)
  }

  const draw = () => ctx.drawImage(src, crop.left, crop.top, crop.width, crop.height, pad, pad, crop.width, crop.height)
  if (transparent && o.touch === 'glow') {
    ctx.save()
    ctx.shadowColor = TOUCH_COLORS[o.touchColor]
    ctx.shadowBlur = edge * 0.035
    // مرتين: هالة أوضح من غير ما الشخص نفسه يتغيّر
    draw(); draw()
    ctx.restore()
  } else if (transparent && o.touch === 'shadow') {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = edge * 0.04
    ctx.shadowOffsetY = edge * 0.02
    draw()
    ctx.restore()
  }
  draw()
  return out
}

/** ترميز: WebP (بيحفظ الشفافية وحجمه صغير)، وPNG لو المتصفح ما بيكتبش WebP. */
export async function encode(c: HTMLCanvasElement, maxEdge: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(c.width, c.height))
  const out = scale < 1 ? shrink(c, maxEdge) : c
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/webp', 0.9))
  if (blob && blob.type === 'image/webp') return blob
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('IMAGE_ENCODE'))), 'image/png'),
  )
}
