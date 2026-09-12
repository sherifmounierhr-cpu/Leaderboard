import { ref } from 'vue'
import { i18n } from '@/i18n'

/**
 * تصدير اللوحة.
 *
 * PNG: يُلتقط عنصر اللوحة كما هو معروض. صور الوكلاء تأتي من نطاق خارجي
 * (lh3.googleusercontent.com)، وإن رفض CORS تلويث الـ canvas تفشل العملية —
 * لذلك نُعيد المحاولة مرة واحدة بعد كتم الصور البعيدة، فتظهر الأحرف الأولى بدلاً
 * منها ويخرج الملف بدل أن يفشل التصدير كلياً.
 *
 * PDF: نافذة الطباعة مع ورقة أنماط مخصّصة — بلا مكتبة ثقيلة، وتنتج ملفاً
 * قابلاً للاختيار والبحث بدل صورة.
 */

export type ExportState = 'idle' | 'working' | 'error'

const state = ref<ExportState>('idle')

function timestamp() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function download(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

let fontCssPromise: Promise<string> | null = null

/**
 * ورقة أنماط الخط جاهزة للتضمين، بملفات woff2 محوّلة إلى data URI.
 *
 * المكتبة تحاول قراءة قواعد ورقة أنماط Google عبر `cssRules` فيمنعها المتصفح
 * لأنها من نطاق آخر، فيخرج الملف بخط النظام بدل Tajawal. الجلب بـ fetch مسموح
 * على النطاقين، فنبنيها بأنفسنا مرة واحدة ونعيد استخدامها.
 */
async function fontEmbedCss(): Promise<string> {
  if (fontCssPromise) return fontCssPromise

  fontCssPromise = (async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="stylesheet"][href*="fonts.googleapis.com/css2"]',
    )
    if (!link) return ''

    const css = await fetch(link.href).then((r) => r.text())
    const urls = [
      ...new Set(
        [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]),
      ),
    ]

    const inlined = await Promise.all(
      urls.map(async (url) => {
        const buffer = (await fetch(url).then((r) => r.arrayBuffer())) as ArrayBuffer
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        return [url, `data:font/woff2;base64,${btoa(binary)}`] as const
      }),
    )

    return inlined.reduce((out, [url, data]) => out.split(url).join(data), css)
  })().catch(() => '')

  return fontCssPromise
}

async function capture(node: HTMLElement, skipRemoteImages: boolean) {
  const { toPng } = await import('html-to-image')
  const fontCss = await fontEmbedCss()

  // السمة تفكّ قيود الارتفاع والتمرير فيخرج المحتوى كاملاً لا مِلء الشاشة فقط
  document.documentElement.setAttribute('data-exporting', skipRemoteImages ? 'no-images' : '1')
  // إطار واحد ليستقر التخطيط الجديد قبل قياس الأبعاد
  await new Promise(requestAnimationFrame)

  try {
    return await toPng(node, {
      pixelRatio: 2,
      // الأبعاد بعد فكّ القيود، لا أبعاد النافذة
      width: node.scrollWidth,
      height: node.scrollHeight,
      // خلفية صريحة: الالتقاط بخلفية شفافة يُنتج PNG غير مقروء على الفاتح
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      // عناصر التحكم ليست جزءاً من التقرير
      filter: (el) =>
        !(el instanceof HTMLElement && el.hasAttribute('data-export-hide')),
      // نمرّرها فقط عند نجاح البناء: السلسلة الفارغة تعني "لا خطوط" لا "دبّر أمرك"
      ...(fontCss ? { fontEmbedCSS: fontCss } : {}),
    })
  } finally {
    document.documentElement.removeAttribute('data-exporting')
  }
}

export function useExport() {
  async function exportPng(node: HTMLElement | null) {
    if (!node) return
    state.value = 'working'
    const name = `everest-leaderboard-${timestamp()}.png`
    try {
      download(await capture(node, false), name)
      state.value = 'idle'
    } catch {
      try {
        // المحاولة الثانية بلا صور بعيدة — تنجح دائماً لأنها بلا موارد خارجية
        download(await capture(node, true), name)
        state.value = 'idle'
      } catch (err) {
        state.value = 'error'
        console.error('[export]', err)
      }
    }
  }

  function exportPdf() {
    // عنوان النافذة يصير اسم ملف الـ PDF الافتراضي
    const previous = document.title
    document.title = `everest-leaderboard-${timestamp()}`
    const restore = () => {
      document.title = previous
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
    // احتياط للمتصفحات التي لا تُطلق afterprint
    setTimeout(restore, 2000)
  }

  return { state, exportPng, exportPdf, locale: i18n.global.locale }
}
