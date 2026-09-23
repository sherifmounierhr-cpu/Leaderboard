import type { NewsItem } from './types'

/**
 * تنظيف مقالات ووردبريس في المتصفح — نسخة احتياطية فقط.
 *
 * الأصل والمسار الطبيعي هو `/api/news` على السيرفر (شوف `api/news.ts`، وفيه
 * نفس الدوال دي بالنص). بنكرّرها هنا عن قصد لأن دالة Vercel ما بتقدرش تستورد
 * من `src/`، والنسخة دي بتشتغل بس لما الاستضافة مفيهاش سيرفر — زي GitHub Pages.
 * أي تعديل هنا لازم ينزل هناك كمان.
 */

/** الروابط الحيّة تحت /blog/<slug>/ — حقل link في ووردبريس قديم ويرجّع 404. */
const BLOG_BASE = 'https://everest-realestate.net/blog/'
const EXCERPT_MAX = 180

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

/**
 * مقاسان لكل خبر: كبير للخبر الرئيسي وشاشة الخبر العاجل (بيملى شاشة 1920،
 * فالمقاسات الصغيرة بتبان مبكسلة)، وصغير للبطاقات الجانبية.
 *
 * بنختار أعرض نسخة في حدود ميزانية حجم، لأن الأصل في ووردبريس أحياناً PNG
 * بـ3 ميجا — الشاشة بتحمّل عشر صور فالفرق بيبان.
 */
const MAX_BIG_BYTES = 2_000_000
const MIN_THUMB_WIDTH = 600

interface Variant {
  url: string
  width: number
  bytes: number
}

function variantsOf(media: Record<string, any>): Variant[] {
  const details = media.media_details ?? {}
  const sizes: Record<string, any> = details.sizes ?? {}
  const origin = safeUrl(media.source_url)
  // ووردبريس بيسيب filesize فاضي في مقاس "full"، وبيحطه على الأصل نفسه
  const originBytes = Number(details.filesize) || 0
  const list: Variant[] = []
  for (const size of Object.values(sizes)) {
    const url = safeUrl(size?.source_url)
    if (!url) continue
    const bytes = Number(size?.filesize) || (url === origin ? originBytes : 0)
    list.push({ url, width: Number(size?.width) || 0, bytes })
  }
  if (origin && !list.some((v) => v.url === origin)) {
    list.push({ url: origin, width: Number(details.width) || 0, bytes: originBytes })
  }
  return list.sort((a, b) => a.width - b.width)
}

function pickImage(post: Record<string, any>): { image: string | null; thumb: string | null } {
  const media = post?._embedded?.['wp:featuredmedia']
  const first = Array.isArray(media) ? media[0] : null
  if (!first || first.code) return { image: null, thumb: null }

  const all = variantsOf(first)
  if (!all.length) return { image: null, thumb: null }

  // حجم صفر يعني ووردبريس ما ذكرهوش، فبناخده على حسن النية
  const affordable = all.filter((v) => !v.bytes || v.bytes <= MAX_BIG_BYTES)
  const big = (affordable.length ? affordable : all).at(-1)
  const small = all.find((v) => v.width >= MIN_THUMB_WIDTH) ?? all.at(-1)
  return { image: big?.url ?? null, thumb: small?.url ?? null }
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
    ...pickImage(post),
    date: String(post?.date_gmt ? `${post.date_gmt}Z` : post?.date ?? ''),
    slug,
    url: `${BLOG_BASE}${slug}/`,
  }
}

/** يحوّل رد `wp/v2/posts?_embed` لعناصر جاهزة للعرض. */
export function postsToNews(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((post) => toItem(post as Record<string, unknown>)).filter((x): x is NewsItem => x !== null)
}
