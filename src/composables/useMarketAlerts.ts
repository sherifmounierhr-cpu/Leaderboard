import { ref } from 'vue'
import type { MarketQuote } from '@/lib/types'
import { useMarkets } from './useMarkets'

/**
 * تنبيه ارتفاع أو انخفاض: لما سعر يتحرك أكتر من حد معيّن عن إغلاق أمس،
 * الشاشة بتوقف على تنبيه بملء الشاشة.
 *
 * مرة واحدة لكل سعر في اليوم وفي كل اتجاه، وإلا الشاشة هتفضل تنبّه على نفس
 * الحركة كل تحديث. `?alert=3` بيغيّر الحد لو شريف حب يضيّقه أو يوسّعه.
 */

const SEEN_KEY = 'everest.markets.alerts'
const DEFAULT_PCT = 2
const TICK_MS = 15_000

export const ALERT_MS = 18_000

const current = ref<{ quote: MarketQuote; endsAt: number } | null>(null)

let started = false
let seen = new Set<string>()

/** مفتاح اليوم بتوقيت القاهرة، فالتنبيه يتجدّد مع بداية يوم العمل. */
function cairoDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
}

function keyOf(quote: MarketQuote): string {
  return `${cairoDay()}:${quote.key}:${quote.changePct > 0 ? 'up' : 'down'}`
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const rows = raw ? (JSON.parse(raw) as unknown) : null
    // مفاتيح الأيام القديمة بتتشال لوحدها: بنحتفظ بتنبيهات النهارده بس
    const today = cairoDay()
    return new Set(
      Array.isArray(rows)
        ? rows.filter((x): x is string => typeof x === 'string' && x.startsWith(today))
        : [],
    )
  } catch {
    return new Set()
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {
    /* تخزين محظور */
  }
}

export function dismissAlert() {
  current.value = null
}

export function useMarketAlerts() {
  const { quotes } = useMarkets()

  if (!started) {
    started = true
    seen = readSeen()
    const asked = Number(new URLSearchParams(location.search).get('alert'))
    const threshold = Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_PCT

    setInterval(() => {
      if (current.value) return
      // أعنف حركة الأول: هي اللي تستاهل توقف الشاشة
      const hit = [...quotes.value]
        .filter((q) => Math.abs(q.changePct) >= threshold && !seen.has(keyOf(q)))
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0]
      if (!hit) return
      seen.add(keyOf(hit))
      writeSeen()
      current.value = { quote: hit, endsAt: Date.now() + ALERT_MS }
    }, TICK_MS)
  }

  return { current, dismiss: dismissAlert }
}
