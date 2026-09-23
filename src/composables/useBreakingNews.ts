import { ref, watch } from 'vue'
import type { NewsItem } from '@/lib/types'
import { useNews } from './useNews'

/**
 * الخبر العاجل: أول ما ينزل خبر جديد على المدونة يتعرض بملء الشاشة مرة واحدة.
 *
 * «جديد» يعني معرّف ما شفناهوش قبل كده على الشاشة دي. أول تشغيل بيسجّل
 * العشرة الموجودين على إنهم متشافوا من غير عرض، وإلا الشاشة هتفضل تعرض
 * أخبار قديمة عند كل فتح.
 */

const SEEN_KEY = 'everest.news.seen'
/** نحتفظ بآخر 80 معرّف — أكتر من كده ملوش لازمة والتخزين محدود. */
const SEEN_MAX = 80
export const BREAKING_MS = 20_000

const queue = ref<NewsItem[]>([])
const current = ref<{ item: NewsItem; endsAt: number } | null>(null)

let started = false
let seen = new Set<number>()

function readSeen(): number[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(list) ? list.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return []
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_MAX)))
  } catch {
    /* تخزين محظور */
  }
}

function markSeen(ids: number[]) {
  for (const id of ids) seen.add(id)
  // Set بيحافظ على ترتيب الإضافة، فالقصّ بيشيل الأقدم
  if (seen.size > SEEN_MAX) seen = new Set([...seen].slice(-SEEN_MAX))
  writeSeen()
}

function next() {
  const item = queue.value.shift()
  current.value = item ? { item, endsAt: Date.now() + BREAKING_MS } : null
}

/** يُنهي الخبر المعروض وينتقل للي بعده إن وُجد. */
export function dismissBreaking() {
  next()
}

export function useBreakingNews() {
  const { items } = useNews()

  if (!started) {
    started = true
    const saved = readSeen()
    seen = new Set(saved)
    // شفنا قائمة قبل كده؟ لو لأ، أول دفعة بتتسجّل من غير عرض
    let primed = saved.length > 0

    watch(
      items,
      (list) => {
        const fresh = list.filter((item) => !seen.has(item.id))
        if (!fresh.length) return
        markSeen(fresh.map((item) => item.id))
        if (!primed) {
          primed = true
          return
        }
        // الأقدم الأول، فالترتيب على الشاشة زمني
        queue.value.push(...[...fresh].reverse())
        if (!current.value) next()
      },
      { immediate: true },
    )
  }

  return { current, dismiss: dismissBreaking }
}
