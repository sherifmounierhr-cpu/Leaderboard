import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * أخبار المدونة (ووردبريس) — تُجلب من السيرفر لا من المتصفح.
 *
 * السبب: الموقع على نطاق تاني، فطلب المتصفح المباشر بيتكسر على CORS، وكمان
 * الرد أكبر من 250KB فيه HTML خام. هنا بننضّفه ونرجّع الحد الأدنى للشاشة.
 *
 * كل المنطق في ملف واحد عن قصد: الاستيراد النسبي بين ملفات api بيفشل وقت
 * التشغيل على Vercel، وخادم التطوير بيستورد loadNews من هنا مباشرةً.
 */

const SOURCE = 'https://dashboard.everest-realestate.net/wp-json/wp/v2/posts?per_page=10&_embed'
/** الروابط الحيّة تحت /blog/<slug>/ — حقل link في ووردبريس قديم ويرجّع 404. */
const BLOG_BASE = 'https://everest-realestate.net/blog/'

const TTL_MS = 10 * 60_000
const TIMEOUT_MS = 8_000
const EXCERPT_MAX = 180

export interface NewsItem {
  id: number
  title: string
  excerpt: string
  image: string | null
  date: string
  slug: string
  url: string
}

export interface NewsPayload {
  items: NewsItem[]
  fetchedAt: string
  /** true يعني الطلب الأخير فشل وده آخر نسخة ناجحة. */
  stale: boolean
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', middot: '·', eacute: 'é',
}

/** فك &#8220; و&amp; وأخواتهما — الردّ بيجيلنا مكوّد مرتين أحياناً. */
function decodeEntities(input: string): string {
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    const named = NAMED[body.toLowerCase()]
    return named === undefined ? match : named
  })
}

/** نص صافي من HTML بمسافات مرتّبة. */
export function plainText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  // مرّتان: بعض العناوين مكوّدة مرتين (&amp;#8220;)
  return decodeEntities(decodeEntities(text))
    .replace(/\s+/g, ' ')
    .trim()
    // ذيل «متابعة القراءة» اللي بيضيفه ووردبريس للمقتطف
    .replace(/\s*(\[(…|\.\.\.)\]|\.\.\.)\s*$/, '…')
}

/** قصّ على حدود كلمة — القطع الأعمى بيبتر آخر كلمة على الشاشة. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

/** مسارات صور ووردبريس فيها حروف عربية خام — نكوّدها قبل ما تروح لـ <img>. */
function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    return new URL(raw).href
  } catch {
    return null
  }
}

/** أصغر مقاس يكفي بطاقة الشاشة — «full» ممكن يكون عدة ميجابايت. */
function pickImage(post: Record<string, any>): string | null {
  const media = post?._embedded?.['wp:featuredmedia']
  const first = Array.isArray(media) ? media[0] : null
  if (!first || first.code) return null
  const sizes = first.media_details?.sizes ?? {}
  for (const name of ['medium_large', 'medium', 'large', 'full']) {
    const url = safeUrl(sizes[name]?.source_url)
    if (url) return url
  }
  return safeUrl(first.source_url)
}

/** مقتطف ووردبريس بيبدأ بالعنوان مكرّراً — نشيله فيفضل الملخّص وحده. */
function trimTitle(excerpt: string, title: string): string {
  if (!excerpt.startsWith(title)) return excerpt
  return excerpt.slice(title.length).replace(/^[\s.،:–—-]+/, '')
}

function toItem(post: Record<string, any>): NewsItem | null {
  const slug = typeof post?.slug === 'string' ? post.slug : ''
  const title = plainText(String(post?.title?.rendered ?? ''))
  if (!slug || !title) return null
  return {
    id: Number(post.id) || 0,
    title,
    excerpt: clip(trimTitle(plainText(String(post?.excerpt?.rendered ?? '')), title), EXCERPT_MAX),
    image: pickImage(post),
    date: String(post?.date_gmt ? `${post.date_gmt}Z` : post?.date ?? ''),
    slug,
    url: `${BLOG_BASE}${slug}/`,
  }
}

let cache: { payload: NewsPayload; at: number } | null = null
let inFlight: Promise<NewsPayload> | null = null

async function fetchFresh(): Promise<NewsPayload> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(SOURCE, {
      signal: abort.signal,
      headers: { accept: 'application/json', 'user-agent': 'EverestLeaderboard/1.0' },
    })
    if (!res.ok) throw new Error(`wp ${res.status}`)
    const posts = await res.json()
    if (!Array.isArray(posts)) throw new Error('wp: unexpected payload')
    const items = posts.map(toItem).filter((x): x is NewsItem => x !== null)
    if (!items.length) throw new Error('wp: no posts')
    return { items, fetchedAt: new Date().toISOString(), stale: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ترجّع الأخبار من الذاكرة لو لسه طازة، وإلا تجيبها. لو الطلب فشل بنرجّع آخر
 * نسخة ناجحة بعلامة stale بدل ما الشريط يفضى على الشاشة.
 */
export async function loadNews(): Promise<NewsPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.payload
  if (!inFlight) {
    inFlight = fetchFresh()
      .then((payload) => {
        cache = { payload, at: Date.now() }
        return payload
      })
      .finally(() => { inFlight = null })
  }
  try {
    return await inFlight
  } catch (err) {
    if (cache) return { ...cache.payload, stale: true }
    throw err
  }
}

/**
 * GET /api/news — آخر 10 مقالات من مدونة إيفرست، منظّفة وجاهزة للعرض.
 * الجلب هنا (على السيرفر) لا في المتصفح: نطاق المدونة مختلف فما بيسمحش بـ CORS.
 */
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  try {
    const payload = await loadNews()
    // الـ CDN يخدم نفس النسخة 10 دقائق، ويقدّم القديمة ساعة لو المصدر وقع
    res.setHeader('cache-control', 'public, s-maxage=600, stale-while-revalidate=3600')
    res.statusCode = 200
    res.end(JSON.stringify(payload))
  } catch (err) {
    res.setHeader('cache-control', 'no-store')
    res.statusCode = 502
    res.end(JSON.stringify({
      items: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      error: err instanceof Error ? err.message : 'news unavailable',
    }))
  }
}
