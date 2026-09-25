import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BoardView } from '@/lib/types'
import { settings, useSettings } from './useSettings'
import { useNews } from './useNews'
import { useMarkets } from './useMarkets'
import { useBoardMedia } from './useBoardMedia'

const query = new URLSearchParams(location.search)
const initialView = query.get('view')

const view = ref<BoardView>(
  initialView === 'agents' || initialView === 'insights' || initialView === 'news' || initialView === 'markets'
    ? initialView
    : 'teams',
)
const settingsOpen = ref(false)
const isFullscreen = ref(false)

/**
 * شاشات بتعرض عناصرها واحد ورا التاني وبتسلّم بنفسها لما تخلص. مدتها بعدد
 * ما هتعرضه مش بثواني ثابتة، فمؤقّت التبديل بيتوقف وهي شغّالة.
 */
const SEQUENCE_VIEWS: BoardView[] = ['news', 'markets']

const { hasNews } = useNews()
const { hasQuotes } = useMarkets()
const { settings: boardSettings } = useBoardMedia()

/**
 * التدوير: الفرق ← المستشارون ← الأخبار ← الأسواق. شاشة التحليلات تُفتح
 * يدوياً كما كانت، وأي شاشة مصدرها واقع تُتخطّى فلا تظهر شاشة فاضية.
 */
export function advanceView() {
  const cycle: BoardView[] = ['teams', 'agents']
  if (hasNews.value && boardSettings.value.news_enabled !== false) cycle.push('news')
  if (hasQuotes.value) cycle.push('markets')
  const at = cycle.indexOf(view.value)
  view.value = cycle[(at + 1) % cycle.length] ?? 'teams'
}

/** إعادة تحميل يومية تمنع تراكم الذاكرة على شاشة تعمل بلا انقطاع. */
const DAILY_RELOAD_MS = 24 * 60 * 60 * 1000

let mounted = false

export function useBoardControls() {
  const { toggleTheme, toggleLocale } = useSettings()

  const toggleView = advanceView

  let rotateTimer: ReturnType<typeof setInterval> | null = null

  function restartRotation() {
    if (rotateTimer) clearInterval(rotateTimer)
    rotateTimer = null
    if (settings.rotate && !SEQUENCE_VIEWS.includes(view.value)) {
      rotateTimer = setInterval(toggleView, settings.rotateSeconds * 1000)
    }
  }

  function toggleRotate() {
    settings.rotate = !settings.rotate
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen?.()
    } catch {
      // المتصفح رفض الطلب خارج إيماءة المستخدم
    }
  }

  function onFullscreenChange() {
    isFullscreen.value = Boolean(document.fullscreenElement)
  }

  function onKeydown(event: KeyboardEvent) {
    // لا نختطف الاختصارات أثناء الكتابة في حقل بحث
    const target = event.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return

    switch (event.key.toLowerCase()) {
      case 't': toggleView(); break
      case 'r': toggleRotate(); break
      case 'f': void toggleFullscreen(); break
      case 's': settingsOpen.value = !settingsOpen.value; break
      case 'l': toggleLocale(); break
      case 'd': toggleTheme(); break
      case 'escape': settingsOpen.value = false; break
    }
  }

  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  onMounted(() => {
    if (mounted) return
    mounted = true
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    restartRotation()
    reloadTimer = setTimeout(() => location.reload(), DAILY_RELOAD_MS)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    if (rotateTimer) clearInterval(rotateTimer)
    if (reloadTimer) clearTimeout(reloadTimer)
    mounted = false
  })

  watch(() => [settings.rotate, settings.rotateSeconds], restartRotation)
  // تبديل يدوي يبدأ العدّ من الأول، فمؤشر التقدم يفضل مطابق للتبديل الفعلي
  watch(view, restartRotation)

  return {
    view,
    settingsOpen,
    isFullscreen,
    toggleView,
    toggleRotate,
    toggleFullscreen,
    toggleTheme,
    toggleLocale,
  }
}
