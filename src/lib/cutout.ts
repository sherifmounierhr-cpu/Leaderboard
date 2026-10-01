/**
 * عزل خلفية صورة شخص في متصفح الإدارة (MODNet، ترخيص Apache-2.0).
 * الموديل (~25MB) بيتحمّل عند أول استخدام بس ويتخزّن في كاش المتصفح،
 * والمكتبة نفسها في chunk منفصل فما تتقّلش على شاشات اللوحة.
 *
 * على خطوتين: `isolate` تشغّل الموديل مرة (بطيئة)، و`renderCutout` تنضّف
 * الحواف بدرجة يختارها المسؤول (سريعة) — فشريط المراجعة يتحرك فوراً.
 */

type Segmenter = (url: string) => Promise<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>

/** ناتج الموديل الخام: ألوان الصورة الأصلية + قناع شفافية لسه ما اتنضّفش. */
export interface RawCutout {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** درجات تنضيف الحافة في شريط المراجعة؛ 2 = الافتراضي. */
export const EDGE_LEVELS = [1, 2, 3, 4] as const
export const DEFAULT_EDGE = 2

let segmenter: Promise<Segmenter> | null = null

function loadSegmenter(): Promise<Segmenter> {
  segmenter ??= import('@huggingface/transformers')
    .then(({ env, pipeline }) => {
      // في البناء: ملفات التشغيل من الموقع نفسه (/ort/)، مش jsdelivr اللي سياسة الأمان بتمنعه
      if (import.meta.env.PROD && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`
      }
      return pipeline('background-removal', 'Xenova/modnet', { dtype: 'fp32' }) as unknown as Promise<Segmenter>
    })
    .catch((err) => {
      segmenter = null
      throw err
    })
  return segmenter
}

export async function isolate(url: string): Promise<RawCutout> {
  const seg = await loadSegmenter()
  const out = await seg(url)
  if (out.channels !== 4) throw new Error('unexpected image channels')
  return { data: new Uint8ClampedArray(out.data), width: out.width, height: out.height }
}

/**
 * لون الحافة: البكسلات شبه الشفافة (خصوصاً الشعر) لونها مخلوط بخلفية البوستر
 * البيضا، فتبان هالة فاتحة على الخلفيات الغامقة. بنستبدل لونها بلون أقرب
 * جزء أكيد من الشخص (بنمدّ ألوان الداخل لبرّه كام بكسل).
 */
function bleedEdgeColors(rgba: Uint8ClampedArray, width: number, height: number, passes: number) {
  const n = width * height
  const known = new Uint8Array(n)
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] >= 235) {
      known[i] = 1
      r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2]
    }
  }
  const next = new Uint8Array(n)
  for (let p = 0; p < passes; p++) {
    next.set(known)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        if (known[i]) continue
        let c = 0, sr = 0, sg = 0, sb = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * width + dx
            if (known[j]) { c++; sr += r[j]; sg += g[j]; sb += b[j] }
          }
        }
        if (c) { r[i] = sr / c; g[i] = sg / c; b[i] = sb / c; next[i] = 1 }
      }
    }
    known.set(next)
  }
  for (let i = 0; i < n; i++) {
    if (known[i] && rgba[i * 4 + 3] < 250) {
      rgba[i * 4] = r[i]; rgba[i * 4 + 1] = g[i]; rgba[i * 4 + 2] = b[i]
    }
  }
}

/** حدّ القناع، قصّه لجوّه بدرجة `level`، وليّنه بكسل عشان الحافة ما تتسننش. */
function cleanAlpha(alpha: Uint8ClampedArray, width: number, height: number, level: number) {
  const LO = 40 + level * 10
  const HI = 230
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = Math.max(0, Math.min(255, ((alpha[i] - LO) * 255) / (HI - LO)))
  }

  const r = Math.max(1, Math.round((width / 1080) * level))
  const tmp = new Uint8ClampedArray(alpha.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 255
      for (let k = -r; k <= r; k++) {
        const v = alpha[y * width + Math.min(width - 1, Math.max(0, x + k))]
        if (v < m) m = v
      }
      tmp[y * width + x] = m
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 255
      for (let k = -r; k <= r; k++) {
        const v = tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x]
        if (v < m) m = v
      }
      alpha[y * width + x] = m
    }
  }
  tmp.set(alpha)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += tmp[(y + dy) * width + x + dx]
      alpha[y * width + x] = s / 9
    }
  }
}

/** PNG شفاف مقصوص على حدود الشخص، بحواف منضّفة بدرجة `level`. */
export async function renderCutout(raw: RawCutout, level: number = DEFAULT_EDGE): Promise<Blob> {
  const { width, height } = raw
  const data = new Uint8ClampedArray(raw.data)
  bleedEdgeColors(data, width, height, Math.max(4, Math.round((width / 1080) * 8)))

  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  cleanAlpha(alpha, width, height, level)

  let top = height, left = width, right = -1, bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alpha[y * width + x]
      data[(y * width + x) * 4 + 3] = a
      if (a > 24) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) throw new Error('no person found in the photo')

  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  full.getContext('2d')!.putImageData(new ImageData(data, width, height), 0, 0)

  const w = right - left + 1
  const h = bottom - top + 1
  const crop = document.createElement('canvas')
  crop.width = w
  crop.height = h
  crop.getContext('2d')!.drawImage(full, left, top, w, h, 0, 0, w, h)

  return new Promise((resolve, reject) =>
    crop.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
  )
}

/** عزل مباشر بالدرجة الافتراضية — للعزل الجماعي بدون مراجعة. */
export async function removeBackground(url: string): Promise<Blob> {
  return renderCutout(await isolate(url), DEFAULT_EDGE)
}
