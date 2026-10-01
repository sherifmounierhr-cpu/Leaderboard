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

/** يرجّع PNG شفاف مقصوص على حدود الشخص، عشان يقف صح فوق صورة الفريق. */
export async function removeBackground(url: string): Promise<Blob> {
  const seg = await loadSegmenter()
  const out = await seg(url)
  if (out.channels !== 4) throw new Error('unexpected image channels')

  const { width, height, data } = out
  let top = height, left = width, right = -1, bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
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
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)

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
