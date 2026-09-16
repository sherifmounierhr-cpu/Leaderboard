import { computed, ref } from 'vue'
import { useBoardData } from '@/composables/useBoardData'

/**
 * الإيقاع: «المفروض نكون وصلنا لكام في المئة من المستهدف النهاردة؟»
 *
 * 79% لوحدها ما بتقولش الفريق سابق ولا متأخر — في أول الربع هي ممتازة
 * وفي آخره متأخرة. نقارنها بنسبة الربع المنقضية بتوقيت القاهرة.
 */

export type PaceStatus = 'ahead' | 'close' | 'behind'

/** أقل من الإيقاع بالمقدار ده يعتبر «قريب»؛ أكتر منه «متأخر». */
export const CLOSE_MARGIN = 10

const DAY = 86_400_000
/** الساعة كل 10 دقايق تكفي — الإيقاع بيتحرك أقل من 1% في اليوم. */
const TICK_MS = 10 * 60_000

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

/** تاريخ اليوم في القاهرة كـ [سنة، شهر 0..11، يوم] بغض النظر عن توقيت الجهاز. */
function cairoParts(date: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return [get('year'), get('month') - 1, get('day')]
}

export interface QuarterProgress {
  /** 0..1 — نسبة الربع المنقضية (اليوم الحالي محسوب كامل). */
  elapsed: number
  /** أيام متبقية بعد اليوم. */
  daysLeft: number
  totalDays: number
  state: 'past' | 'current' | 'future'
}

export function quarterProgress(year: number, quarter: number, date = new Date()): QuarterProgress {
  const [y, m, d] = cairoParts(date)
  const start = Date.UTC(year, (quarter - 1) * 3, 1)
  const end = Date.UTC(year, quarter * 3, 1)
  const today = Date.UTC(y, m, d)
  const totalDays = Math.round((end - start) / DAY)
  if (today >= end) return { elapsed: 1, daysLeft: 0, totalDays, state: 'past' }
  if (today < start) return { elapsed: 0, daysLeft: totalDays, totalDays, state: 'future' }
  const done = Math.round((today - start) / DAY) + 1
  return { elapsed: done / totalDays, daysLeft: totalDays - done, totalDays, state: 'current' }
}

export function paceStatus(pct: number, expectedPct: number): PaceStatus {
  if (pct >= expectedPct) return 'ahead'
  if (pct >= expectedPct - CLOSE_MARGIN) return 'close'
  return 'behind'
}

export function usePace() {
  if (!timer) timer = setInterval(() => { now.value = new Date() }, TICK_MS)
  const { year, quarter } = useBoardData()

  const progress = computed(() => quarterProgress(year.value, quarter.value, now.value))

  /** نسبة الإيقاع المتوقعة (0..100)، أو null لربع لم يبدأ — لا معنى لعلامة فيه. */
  const expectedPct = computed<number | null>(() =>
    progress.value.state === 'future' ? null : Math.round(progress.value.elapsed * 100),
  )

  const statusOf = (pct: number): PaceStatus | null =>
    expectedPct.value === null ? null : paceStatus(pct, expectedPct.value)

  return { progress, expectedPct, statusOf }
}
