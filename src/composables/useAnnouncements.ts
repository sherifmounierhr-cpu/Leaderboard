import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { Announcement } from '@/lib/types'

/**
 * رسائل الترحيب والتحفيز. الجدولة بتتحسب هنا على كل شاشة بتوقيت القاهرة:
 * لكل رسالة «نافذة عرض» = [موعدها، موعدها + مدتها]. أي شاشة مفتوحة جوه
 * النافذة بتعرضها للوقت الباقي — فالشاشة اللي تتفتح متأخر تلحق، وكل الشاشات
 * متزامنة مع الساعة من غير cron. كل موعد بيتعرض مرة واحدة لكل جهاز.
 */

const TICK_MS = 5_000
const FALLBACK_POLL_MS = 5 * 60_000
const SEEN_KEY = 'everest.announcements.seen'
const SEEN_MAX = 200
const TZ = 'Africa/Cairo'

export interface ShownAnnouncement {
  key: string
  announcement: Announcement
  /** وقت انتهاء العرض (ms) — المدة الباقية تتحسب منه. */
  endsAt: number
  /** معاينة من الإدارة: ما تتسجلش كـ«اتعرضت». */
  preview?: boolean
}

const list = ref<Announcement[]>([])
const current = ref<ShownAnnouncement | null>(null)
const seen = ref<string[]>(readSeen())

let started = false

function readSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function markSeen(key: string) {
  seen.value = [...seen.value.filter((k) => k !== key), key].slice(-SEEN_MAX)
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.value)) } catch { /* تخزين محظور */ }
}

// ------------------------------------------------------------ توقيت القاهرة
function cairoParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return {
    year: Number(get('year')), month: Number(get('month')) - 1, day: Number(get('day')),
    hour: Number(get('hour')), minute: Number(get('minute')), second: Number(get('second')), weekday,
  }
}

/** ساعة حائط في القاهرة ← لحظة زمنية حقيقية (يراعي التوقيت الصيفي). */
export function cairoWallTime(year: number, month: number, day: number, hour: number, minute: number): number {
  const guess = Date.UTC(year, month, day, hour, minute)
  const p = cairoParts(new Date(guess))
  const offset = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second) - guess
  return guess - offset
}

/** موعد العرض اللي نافذته مفتوحة دلوقتي، أو null. */
export function activeOccurrence(a: Announcement, now = Date.now()): number | null {
  if (!a.active) return null
  const span = a.duration_s * 1000
  if (a.schedule === 'once') {
    const start = a.starts_at ? new Date(a.starts_at).getTime() : NaN
    return now >= start && now < start + span ? start : null
  }
  if (!a.daily_time) return null
  const [hh, mm] = a.daily_time.split(':').map(Number)
  // النهارده وامبارح: رسالة 11:59 م بمدة دقيقتين نافذتها بتعدّي نص الليل
  for (const back of [0, 1]) {
    const p = cairoParts(new Date(now - back * 86_400_000))
    if (!a.weekdays.includes(p.weekday)) continue
    const start = cairoWallTime(p.year, p.month, p.day, hh, mm)
    if (now >= start && now < start + span) return start
  }
  return null
}

/** الموعد الجاي (للعرض في الإدارة). */
export function nextOccurrence(a: Announcement, now = Date.now()): number | null {
  if (!a.active) return null
  if (a.schedule === 'once') {
    const start = a.starts_at ? new Date(a.starts_at).getTime() : NaN
    return start + a.duration_s * 1000 > now ? start : null
  }
  if (!a.daily_time || !a.weekdays.length) return null
  const [hh, mm] = a.daily_time.split(':').map(Number)
  for (let ahead = 0; ahead <= 7; ahead++) {
    const p = cairoParts(new Date(now + ahead * 86_400_000))
    if (!a.weekdays.includes(p.weekday)) continue
    const start = cairoWallTime(p.year, p.month, p.day, hh, mm)
    if (start + a.duration_s * 1000 > now) return start
  }
  return null
}

// ------------------------------------------------------------ التحميل والفحص
function normalize(a: Announcement): Announcement {
  return { ...a, duration_s: Number(a.duration_s), weekdays: (a.weekdays ?? []).map(Number) }
}

async function load() {
  if (!hasSupabaseConfig) return
  const { data, error } = await supabase.from('lb_announcements').select('*').order('created_at', { ascending: false })
  if (error) {
    console.warn('[announcements]', error.message)
    return
  }
  list.value = ((data ?? []) as Announcement[]).map(normalize)
  // رسالة اتعدلت أو اتوقفت وهي معروضة: تتقفل أو تتحدث فوراً
  if (current.value && !current.value.preview) {
    const fresh = list.value.find((a) => a.id === current.value!.announcement.id)
    if (!fresh || !fresh.active) current.value = null
    else current.value = { ...current.value, announcement: fresh }
  }
  // الإدارة بتحمّل القائمة بس — الفحص (وتعليم «اتعرضت») للوحة وحدها
  if (started) check()
}

function check() {
  const now = Date.now()
  if (current.value && now >= current.value.endsAt) current.value = null
  if (current.value) return
  // الأحدث تعديلاً أولاً: رسالة «الآن» اتبعتت حالاً تغلب رسالة يومية قديمة
  const candidates = [...list.value].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  for (const a of candidates) {
    const start = activeOccurrence(a, now)
    if (start === null) continue
    const key = `${a.id}:${start}`
    if (seen.value.includes(key)) continue
    markSeen(key)
    current.value = { key, announcement: a, endsAt: start + a.duration_s * 1000 }
    return
  }
}

function start() {
  if (started || !hasSupabaseConfig) return
  started = true
  void load()
  supabase
    .channel('leaderboard-announcements')
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'announcements' }, () => void load())
    .subscribe()
  setInterval(check, TICK_MS)
  setInterval(() => void load(), FALLBACK_POLL_MS)
}

function dismiss() {
  current.value = null
}

/** معاينة على الشاشة دي بس — من غير ما تتسجل أو توصل للشاشات التانية. */
function preview(a: Announcement) {
  current.value = { key: `preview:${Date.now()}`, announcement: a, endsAt: Date.now() + a.duration_s * 1000, preview: true }
}

/**
 * @param schedule false في صفحة الإدارة: معاينة بس. الجدولة هناك كانت هتعلّم
 * الرسالة «اتعرضت» في localStorage المشترك، فتفوت على تبويب اللوحة في نفس الجهاز.
 */
export function useAnnouncements({ schedule = true }: { schedule?: boolean } = {}) {
  if (schedule) start()
  return { list, current, dismiss, preview, reload: load, hasActive: computed(() => Boolean(current.value)) }
}
