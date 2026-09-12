import { onBeforeUnmount, onMounted, watch } from 'vue'
import { settings } from './useSettings'

type WakeLockSentinel = { released: boolean; release(): Promise<void> }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}

/**
 * يمنع إطفاء الشاشة أثناء العرض على تلفزيون المكتب.
 * المتصفح يسحب القفل عند إخفاء التبويب، لذا نعيد طلبه عند العودة.
 */
export function useWakeLock() {
  let sentinel: WakeLockSentinel | null = null

  async function request() {
    const nav = navigator as WakeLockNavigator
    if (!nav.wakeLock || !settings.keepAwake || document.visibilityState !== 'visible') return
    try {
      sentinel = await nav.wakeLock.request('screen')
    } catch {
      // مرفوض (بطارية منخفضة أو سياسة المتصفح) — العرض يستمر بدونه
    }
  }

  async function release() {
    try {
      await sentinel?.release()
    } catch {
      /* تم سحبه بالفعل */
    }
    sentinel = null
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void request()
  }

  onMounted(() => {
    void request()
    document.addEventListener('visibilitychange', onVisibility)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    void release()
  })

  watch(
    () => settings.keepAwake,
    (on) => (on ? void request() : void release()),
  )
}
