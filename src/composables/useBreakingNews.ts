import { ref } from 'vue'
import type { NewsItem } from '@/lib/types'
import { useNews } from './useNews'
import { useBoardMedia } from './useBoardMedia'
import { useNewsControls } from './useNewsControls'

/**
 * الخبر العاجل: أول ما ينزل خبر جديد على المدونة يتعرض بملء الشاشة، ويتعاد
 * مرتين كمان كل 5 دقايق — عشان اللي دخل المكتب متأخر يشوفه برضه.
 *
 * «جديد» يعني معرّف ما شفناهوش قبل كده على الشاشة دي. أول تشغيل بيسجّل
 * الموجود على إنه اتعرض خلاص، وإلا الشاشة هتعيد أخبار قديمة عند كل فتح.
 */

const PLAYS_KEY = 'everest.news.plays'
/** نحتفظ بآخر 80 خبر — أكتر من كده ملوش لازمة والتخزين محدود. */
const MAX_TRACKED = 80

export const BREAKING_MS = 20_000
/** الافتراضي لو الإعدادات لسه ما وصلتش. */
const DEFAULT_REPEATS = 3
const DEFAULT_GAP_MIN = 5
const TICK_MS = 10_000

interface Play {
  /** كام مرة اتعرض. لما توصل REPEATS بيبطّل. */
  count: number
  /** أقرب وقت مسموح فيه بالعرض الجاي. */
  nextAt: number
}

const current = ref<{ item: NewsItem; endsAt: number } | null>(null)

let started = false
let plays = new Map<number, Play>()

function readPlays(): Map<number, Play> {
  try {
    const raw = localStorage.getItem(PLAYS_KEY)
    const rows = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(rows)) return new Map()
    const map = new Map<number, Play>()
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      const [id, count, nextAt] = row as [unknown, unknown, unknown]
      if (typeof id === 'number') {
        map.set(id, { count: Number(count) || 0, nextAt: Number(nextAt) || 0 })
      }
    }
    return map
  } catch {
    return new Map()
  }
}

function writePlays() {
  // Map بيحافظ على ترتيب الإضافة، فالقصّ بيشيل الأقدم
  if (plays.size > MAX_TRACKED) plays = new Map([...plays].slice(-MAX_TRACKED))
  try {
    localStorage.setItem(
      PLAYS_KEY,
      JSON.stringify([...plays].map(([id, play]) => [id, play.count, play.nextAt])),
    )
  } catch {
    /* تخزين محظور */
  }
}

/** الفاصل الحالي بين الإعادات، بتحدّثه الشاشة من الإعدادات. */
let gapMsNow = DEFAULT_GAP_MIN * 60_000

/** يُنهي الخبر المعروض ويحجز ميعاد إعادته. */
export function dismissBreaking() {
  const shown = current.value
  current.value = null
  if (!shown) return
  const play = plays.get(shown.item.id)
  if (!play) return
  play.count += 1
  play.nextAt = Date.now() + gapMsNow
  writePlays()
}

export function useBreakingNews() {
  const { items } = useNews()
  const { settings } = useBoardMedia()
  const { hiddenIds } = useNewsControls()

  const repeats = () => settings.value.news_repeats ?? DEFAULT_REPEATS
  const gapMs = () => (settings.value.news_gap_min ?? DEFAULT_GAP_MIN) * 60_000

  if (!started) {
    started = true
    plays = readPlays()
    // شفنا قائمة قبل كده؟ لو لأ، أول دفعة بتتسجّل كأنها اتعرضت
    let primed = plays.size > 0
    try {
      // مفتاح قديم من نسخة العرض مرة واحدة
      localStorage.removeItem('everest.news.seen')
    } catch {
      /* تخزين محظور */
    }

    const tick = () => {
      // خبر مخفي من الإدارة ما يتعرضش ولا يتسجّل
      const list = items.value.filter((item) => !hiddenIds.value.has(item.id))
      if (!list.length) return
      if (settings.value.news_enabled === false) return

      // تسجيل أي خبر لسه ما نعرفوش
      let added = false
      for (const item of list) {
        if (plays.has(item.id)) continue
        plays.set(item.id, primed ? { count: 0, nextAt: Date.now() } : { count: repeats(), nextAt: 0 })
        added = true
      }
      if (added) {
        primed = true
        writePlays()
      }

      gapMsNow = gapMs()
      if (current.value) return

      // الأقدم الأول، فالترتيب على الشاشة زمني
      const now = Date.now()
      const due = [...list].reverse().find((item) => {
        const play = plays.get(item.id)
        return play ? play.count < repeats() && play.nextAt <= now : false
      })
      if (due) current.value = { item: due, endsAt: now + BREAKING_MS }
    }

    tick()
    setInterval(tick, TICK_MS)
  }

  return { current, dismiss: dismissBreaking }
}
