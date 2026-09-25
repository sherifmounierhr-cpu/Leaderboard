import { computed, ref } from 'vue'
import type { NewsItem } from '@/lib/types'
import { postsToNews } from '@/lib/news'

/**
 * أخبار المدونة لشريط الشاشة. الجلب من `/api/news` — دالة على السيرفر تعمل
 * الطلب نيابة عن المتصفح، فتتجنّب CORS وتبعت للشاشة نسخة منظّفة صغيرة.
 *
 * ولو الاستضافة ساكنة ومفيهاش دالة (GitHub Pages) بنرجع لجلب مباشر من
 * المتصفح، لأن المدونة بتسمح بالقراءة من أي نطاق.
 *
 * تحديث كل دقيقتين، ومع أي فشل بنفضل على آخر نسخة ناجحة: الشاشة معلّقة في
 * مكتب طول اليوم، فأسوأ من خبر قديم إن الشريط يفضى فجأة.
 */

const ENDPOINT = '/api/news'
/** المصدر المباشر، للاحتياطي وحده. */
const SOURCE = 'https://dashboard.everest-realestate.net/wp-json/wp/v2/posts?per_page=10&_embed'
const REFRESH_MS = 2 * 60_000
const RETRY_MS = 60_000
const CACHE_KEY = 'everest.news'

interface CachedPayload {
  items: NewsItem[]
  fetchedAt: string
}

const items = ref<NewsItem[]>([])
const fetchedAt = ref<Date | null>(null)
const stale = ref(false)
/** آخر سبب فشل، للعرض في صفحة الإدارة. */
const lastError = ref<string | null>(null)

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

/** المسار الطبيعي: دالة السيرفر. بترجّع null لو مش موجودة (استضافة ساكنة). */
async function fromServer(): Promise<NewsItem[] | null> {
  try {
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    const payload = (await res.json().catch(() => null)) as { items?: NewsItem[]; error?: string } | null
    if (!res.ok || !payload) {
      lastError.value = payload?.error ?? `HTTP ${res.status}`
      return null
    }
    if (!Array.isArray(payload.items) || !payload.items.length) {
      lastError.value = payload.error ?? 'empty'
      return null
    }
    lastError.value = null
    return payload.items
  } catch (err) {
    lastError.value = err instanceof Error ? err.message : 'network'
    return null
  }
}

/**
 * احتياطي لاستضافة من غير سيرفر (GitHub Pages): نجيب من ووردبريس مباشرةً.
 * ممكن لأن المدونة بترجّع `Access-Control-Allow-Origin: *` للقراءة العامة.
 */
async function fromWordPress(): Promise<NewsItem[] | null> {
  try {
    const res = await fetch(SOURCE, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const list = postsToNews(await res.json())
    return list.length ? list : null
  } catch {
    return null
  }
}

async function load(): Promise<boolean> {
  const fresh = (await fromServer()) ?? (await fromWordPress())
  if (!fresh) {
    // الطلب فشل: بنسيب المعروض زي ما هو ونعلّمه قديم
    stale.value = true
    return false
  }
  items.value = fresh
  fetchedAt.value = new Date()
  stale.value = false
  writeCache({ items: fresh, fetchedAt: fetchedAt.value.toISOString() })
  return true
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
    lastError: computed(() => lastError.value),
    hasNews: computed(() => items.value.length > 0),
    refresh: () => void tick(),
  }
}
