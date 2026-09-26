import { computed, ref } from 'vue'
import type { NewsItem } from '@/lib/types'
import { postsToNews } from '@/lib/news'

/**
 * أخبار المدونة لشريط الشاشة. الجلب المباشر من ووردبريس أولاً: المدونة
 * بتسمح بالقراءة من أي نطاق (CORS *)، وCloudflare قدّامها بيقبل طلب الشاشة.
 *
 * `/api/news` (دالة على Vercel) احتياطي بس: Cloudflare بيرفض طلبات سيرفرات
 * Vercel بـ 403 لأنها من داتا سنتر، حتى بترويسات متصفح كاملة. لو صاحب المدونة
 * سمح لـ /wp-json/ في Cloudflare، الدالة ترجع تشتغل من غير أي تعديل هنا.
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

type Fetched = { items: NewsItem[] } | { error: string }

/** المسار الأساسي: ووردبريس مباشرةً من المتصفح. */
async function fromWordPress(): Promise<Fetched> {
  try {
    const res = await fetch(SOURCE, { headers: { accept: 'application/json' } })
    if (!res.ok) return { error: `wp ${res.status}` }
    const list = postsToNews(await res.json())
    return list.length ? { items: list } : { error: 'wp: no posts' }
  } catch (err) {
    return { error: `wp: ${err instanceof Error ? err.message : 'network'}` }
  }
}

/** احتياطي: دالة السيرفر (مش موجودة على GitHub Pages، ومحجوبة حالياً على Vercel). */
async function fromServer(): Promise<Fetched> {
  try {
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    const payload = (await res.json().catch(() => null)) as { items?: NewsItem[]; error?: string } | null
    if (!res.ok || !payload) return { error: `api: ${payload?.error ?? `HTTP ${res.status}`}` }
    if (!Array.isArray(payload.items) || !payload.items.length) return { error: `api: ${payload.error ?? 'empty'}` }
    return { items: payload.items }
  } catch (err) {
    return { error: `api: ${err instanceof Error ? err.message : 'network'}` }
  }
}

async function load(): Promise<boolean> {
  const direct = await fromWordPress()
  const result = 'items' in direct ? direct : await fromServer()
  if (!('items' in result)) {
    // الطريقتين فشلوا: بنسيب المعروض زي ما هو ونعلّمه قديم، والسببين للإدارة
    lastError.value = 'error' in direct ? `${direct.error} · ${result.error}` : result.error
    stale.value = true
    return false
  }
  lastError.value = null
  const fresh = result.items
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
