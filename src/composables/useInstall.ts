import { computed, ref } from 'vue'

/** حدث Chrome/Samsung/Edge على أندرويد: المتصفح جاهز يعرض نافذة التثبيت. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<InstallPromptEvent | null>(null)
const ua = navigator.userAgent
// iPadOS بيعرّف نفسه كـ Mac، فنميّزه باللمس
const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
const isAndroid = /Android/.test(ua)
/**
 * Samsung Internet بيبني حزمة التثبيت بنفسه على إصدار أندرويد قديم، فـ Google
 * Play Protect بيحجبها («Unsafe app blocked»). الحل من Chrome: حزمته من Google.
 */
const isSamsung = /SamsungBrowser/.test(ua)
const installed = ref(
  window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
)

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferred.value = event as InstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  deferred.value = null
  installed.value = true
})

// خادم التطوير بلا service worker: HMR والـ SW ما بيتفقوش
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}

/**
 * التثبيت كتطبيق: أندرويد له نافذة تثبيت نطلبها بزرار؛ iOS مالوش، فنعرض
 * الخطوات اليدوية (مشاركة ← إضافة إلى الشاشة الرئيسية).
 */
export function useInstall() {
  /** prompt: زرار يثبّت مباشرة · ios / android / samsung: خطوات يدوية · null: لا يُعرض شيء */
  const mode = computed<'prompt' | 'ios' | 'android' | 'samsung' | null>(() => {
    if (installed.value) return null
    if (isSamsung) return 'samsung'
    if (deferred.value) return 'prompt'
    if (isIos) return 'ios'
    if (isAndroid) return 'android'
    return null
  })

  async function install() {
    const event = deferred.value
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === 'accepted') deferred.value = null
  }

  return { mode, install }
}
