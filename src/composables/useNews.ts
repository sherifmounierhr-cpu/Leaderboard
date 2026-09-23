import { computed, ref } from 'vue'
import type { NewsItem } from '@/lib/types'

/**
 * أخبار المدونة لشريط الشاشة. الجلب من `/api/news` — دالة على السيرفر تعمل
 * الطلب نيابة عن المتصفح (المدونة على نطاق تاني وما بتسمحش بـ CORS).
 *
 * تحديث كل 10 دقائق، ومع أي فشل بنفضل على آخر نسخة ناجحة: الشاشة معلّقة في
 * مكتب طول اليوم، فأسوأ من خبر قديم إن الشريط يفضى فجأة.
 */

const ENDPOINT = '/api/news'
const REFRESH_MS = 10 * 60_000
const RETRY_MS = 60_000
const CACHE_KEY = 'everest.news'

interface CachedPayload {
  items: NewsItem[]
  fetchedAt: string
}

const items = ref<NewsItem[]>([])
const fetchedAt = ref<Date | null>(null)
const stale = ref(false)

let started = false
let timer: ReturnType<typeof setTimeout> | null = null

/** آخر نسخة ناجحة من الجلسة السابقة — تظهر فوراً قبل ما أول طلب يرجع. */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const cached = JSON.parse(raw) as CachedPayload
    if (Array.isArray(cached.items) && cached.items.length) {
      items.value = cached.items
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
    const payload = (await res.json()) as { items?: NewsItem[]; fetchedAt?: string; stale?: boolean }
    if (!Array.isArray(payload.items) || !payload.items.length) throw new Error('empty')
    items.value = payload.items
    fetchedAt.value = payload.fetchedAt ? new Date(payload.fetchedAt) : new Date()
    stale.value = payload.stale === true
    writeCache({ items: payload.items, fetchedAt: fetchedAt.value.toISOString() })
    return true
  } catch {
    // الطلب فشل: بنسيب المعروض زي ما هو ونعلّمه قديم
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

export function useNews() {
  if (!started) {
    started = true
    readCache()
    void tick()
    // الشاشة بتنام ساعات: الرجوع من السكون يستاهل تحديث فوري بدل انتظار المؤقّت
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const age = fetchedAt.value ? Date.now() - fetchedAt.value.getTime() : Infinity
      if (age >= REFRESH_MS) void tick()
    })
  }
  return {
    items: computed(() => items.value),
    fetchedAt: computed(() => fetchedAt.value),
    stale: computed(() => stale.value),
    hasNews: computed(() => items.value.length > 0),
    refresh: () => void tick(),
  }
}
