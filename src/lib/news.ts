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

/** يحوّل رد `wp/v2/posts?_embed` لعناصر جاهزة للعرض. */
export function postsToNews(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((post) => toItem(post as Record<string, unknown>)).filter((x): x is NewsItem => x !== null)
}
