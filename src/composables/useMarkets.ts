import { computed, ref } from 'vue'
import type { MarketQuote } from '@/lib/types'

/**
 * أسعار الأسواق لشاشة الأسواق: الذهب والمعادن والدولار والبورصة وأسهم
 * التطوير العقاري. الجلب من `/api/markets` — دالة على السيرفر بتجمّع
 * الأسعار وتكاشها، لأن المصدر ما بيسمحش بطلب من المتصفح.
 *
 * تحديث كل 3 دقايق، ومع أي فشل بنفضل على آخر نسخة ناجحة بدل ما الشاشة تفضى.
 */

const ENDPOINT = '/api/markets'
const REFRESH_MS = 3 * 60_000
const RETRY_MS = 60_000
const CACHE_KEY = 'everest.markets'

interface CachedPayload {
  quotes: MarketQuote[]
  fetchedAt: string
}

const quotes = ref<MarketQuote[]>([])
const fetchedAt = ref<Date | null>(null)
const stale = ref(false)

let started = false
let timer: ReturnType<typeof setTimeout> | null = null

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const cached = JSON.parse(raw) as CachedPayload
    if (Array.isArray(cached.quotes) && cached.quotes.length) {
      quotes.value = cached.quotes
      fetchedAt.value = new Date(cached.fetchedAt)
      stale.value = true
    }
  } catch {
    /* تخزين محظور أو نسخة تالفة */
  }
}

function writeCache(payload: CachedPayload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* تخزين محظور */
  }
}

async function load(): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(String(res.status))
    const payload = (await res.json()) as { quotes?: MarketQuote[]; fetchedAt?: string; stale?: boolean }
    if (!Array.isArray(payload.quotes) || !payload.quotes.length) throw new Error('empty')
    quotes.value = payload.quotes
    fetchedAt.value = payload.fetchedAt ? new Date(payload.fetchedAt) : new Date()
    stale.value = payload.stale === true
    writeCache({ quotes: payload.quotes, fetchedAt: fetchedAt.value.toISOString() })
    return true
  } catch {
    stale.value = true
    return false
  }
}

function schedule(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void tick(), ms)
}

async function tick() {
  const ok = await load()
  schedule(ok ? REFRESH_MS : RETRY_MS)
}

export function useMarkets() {
  if (!started) {
    started = true
    readCache()
    void tick()
    // الشاشة بتنام ساعات: الرجوع من السكون يستاهل تحديث فوري
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const age = fetchedAt.value ? Date.now() - fetchedAt.value.getTime() : Infinity
      if (age >= REFRESH_MS) void tick()
    })
  }

  return {
    quotes: computed(() => quotes.value),
    fetchedAt: computed(() => fetchedAt.value),
    stale: computed(() => stale.value),
    hasQuotes: computed(() => quotes.value.length > 0),
    /** كل مجموعة بترتيبها من السيرفر. */
    groupOf: (group: string) => computed(() => quotes.value.filter((q) => q.group === group)),
  }
}
