import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** أبعاد عنصر بالبكسل — الرسوم تُحسب بأبعاد حقيقية لا بـ viewBox ممطوط. */
export function useElementSize(target: Ref<HTMLElement | null>) {
  const width = ref(0)
  const height = ref(0)
  let observer: ResizeObserver | null = null

  function measure() {
    const el = target.value
    if (!el) return
    const box = el.getBoundingClientRect()
    width.value = box.width
    height.value = box.height
  }

  onMounted(() => {
    measure()
    if (target.value && 'ResizeObserver' in window) {
      observer = new ResizeObserver(measure)
      observer.observe(target.value)
    }
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { width, height, measure }
}
