/**
 * عزل خلفية صورة شخص في متصفح الإدارة (MODNet، ترخيص Apache-2.0).
 * الموديل (~25MB) بيتحمّل عند أول استخدام بس ويتخزّن في كاش المتصفح،
 * والمكتبة نفسها في chunk منفصل فما تتقّلش على شاشات اللوحة.
 */

type Segmenter = (url: string) => Promise<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>

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

/**
 * تنضيف حواف القناع: الموديل بيسيب حافة شبه شفافة فيها لون الخلفية القديمة
 * (هالة بيضا حوالين الشخص على الخلفيات الغامقة). نحدّ القناع، نقصّه كام بكسل
 * لجوّه، ونليّنه بكسل واحد عشان الحافة ما تبقاش مسنّنة.
 */
function cleanAlpha(alpha: Uint8ClampedArray, width: number, height: number) {
  const LO = 60
  const HI = 230
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = Math.max(0, Math.min(255, ((alpha[i] - LO) * 255) / (HI - LO)))
  }

  const r = Math.max(1, Math.round(width / 540))
  const tmp = new Uint8ClampedArray(alpha.length)
  // تآكل (min filter) منفصل: أفقي ثم رأسي
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 255
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        const v = alpha[y * width + xx]
        if (v < m) m = v
      }
      tmp[y * width + x] = m
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 255
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        const v = tmp[yy * width + x]
        if (v < m) m = v
      }
      alpha[y * width + x] = m
    }
  }
  // تليين 3×3
  tmp.set(alpha)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let s = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += tmp[(y + dy) * width + x + dx]
      alpha[y * width + x] = s / 9
    }
  }
}

/** يرجّع PNG شفاف مقصوص على حدود الشخص، بحواف نضيفة. */
export async function removeBackground(url: string): Promise<Blob> {
  const seg = await loadSegmenter()
  const out = await seg(url)
  if (out.channels !== 4) throw new Error('unexpected image channels')

  const { width, height } = out
  const data = new Uint8ClampedArray(out.data)
  const alpha = new Uint8ClampedArray(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  cleanAlpha(alpha, width, height)

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
