import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * رقم يعدّ لقيمته الجديدة بدل ما يقفز لها — الرقم الكبير على التلفزيون
 * لما يتحرك بيلفت النظر لإن فيه صفقة دخلت.
 *
 * أول قيمة تظهر فوراً (مفيش عدّ من صفر عند فتح الصفحة)، ومن يفضّل تقليل
 * الحركة يشوف القيمة النهائية مباشرة.
 */
const DURATION_MS = 1200

export function useCountUp(source: Readonly<Ref<number>>): Readonly<Ref<number>> {
  const shown = ref(source.value)
  let frame = 0

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  watch(source, (to) => {
    cancelAnimationFrame(frame)
    const from = shown.value
    if (from === to || reduced() || document.hidden) {
      shown.value = to
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      shown.value = from + (to - from) * eased
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  })

  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return shown
}
