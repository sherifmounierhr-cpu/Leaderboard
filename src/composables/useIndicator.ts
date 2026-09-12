import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/**
 * مؤشر منزلق يتتبع العنصر ذا aria-selected داخل حاوية tablist.
 * يعمل في الاتجاهين RTL و LTR لأنه يقيس المواضع فعلياً بدل افتراض جهة البداية.
 */
export function useIndicator(container: Ref<HTMLElement | null>, dependency: Ref<unknown>) {
  const indicatorStyle = ref<Record<string, string | number>>({ opacity: 0 })
  const ready = ref(false)

  function measure() {
    const el = container.value
    if (!el) return
    const selected = el.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!selected) {
      indicatorStyle.value = { ...indicatorStyle.value, opacity: 0 }
      return
    }
    const box = el.getBoundingClientRect()
    const target = selected.getBoundingClientRect()
    indicatorStyle.value = {
      opacity: 1,
      width: `${target.width}px`,
      height: `${target.height}px`,
      transform: `translate(${target.left - box.left}px, ${target.top - box.top}px)`,
    }
  }

  let observer: ResizeObserver | null = null

  onMounted(() => {
    measure()
    // الإطار الثاني: بعد استقرار الخطوط والتخطيط، ثم نسمح بالانتقال
    requestAnimationFrame(() => {
      measure()
      requestAnimationFrame(() => (ready.value = true))
    })
    if (container.value && 'ResizeObserver' in window) {
      observer = new ResizeObserver(measure)
      observer.observe(container.value)
    }
    window.addEventListener('resize', measure)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', measure)
  })

  watch(dependency, () => requestAnimationFrame(measure))

  return { indicatorStyle, ready, measure }
}
