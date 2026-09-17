import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { SaleEventRow } from '@/lib/types'

/** عدد الإشعارات المعروضة في القائمة. */
const FEED_LIMIT = 30

/**
 * حفظ صف كامل من الإدارة أو استيراد ملف قد يولّد أحداثاً كثيرة دفعة واحدة.
 * نحتفل بأكبرها فقط حتى لا تُحجب اللوحة دقائق — والباقي يبقى في الإشعارات.
 */
const MAX_CELEBRATIONS = 3

/**
 * حدث أقدم من هذا لا يُحتفل به عند وصوله: شاشة نامت أو فقدت الاتصال ساعة
 * ثم عادت لا يجب أن تفرّغ طابوراً من احتفالات قديمة. يبقى ظاهراً في القائمة.
 */
const STALE_MS = 10 * 60_000

/** الأحداث المتتالية في نفس الحفظ تصل كرسائل منفصلة؛ ننتظر قليلاً لنجمعها. */
const BATCH_MS = 600
const FALLBACK_POLL_MS = 120_000
const READ_KEY = 'everest-leaderboard:notifications-read'

export interface Celebration {
  /** مفتاح فريد لكل عرض — لازم لإعادة تشغيل الحركة لو تكرر نفس الحدث. */
  key: string
  event: SaleEventRow
}

// ------------------------------------------------------------------ state
const events = ref<SaleEventRow[]>([])
const celebrations = ref<Celebration[]>([])
const lastReadId = ref(readStoredId())

/** أعلى معرّف رأيناه — يمنع الاحتفال بنفس الحدث مرتين. */
let lastSeenId = 0

/**
 * ما وقع قبل فتح الصفحة تاريخ، لا حدث جديد. نقارن بالوقت لا بـ«أول تحميل»:
 * لو فشل أول تحميل (انقطاع، جلسة تتجدد) لا يُعامَل الحدث التالي كتاريخ فيضيع
 * احتفاله. هامش صغير لفرق الساعة بين الجهاز والخادم.
 */
const CLOCK_SKEW_MS = 5_000
const openedAt = Date.now() - CLOCK_SKEW_MS

function readStoredId(): number {
  try {
    return Number(localStorage.getItem(READ_KEY)) || 0
  } catch {
    return 0
  }
}

const unreadCount = computed(() => events.value.filter((e) => e.id > lastReadId.value).length)

function markAllRead() {
  const top = events.value[0]?.id ?? 0
  if (top <= lastReadId.value) return
  lastReadId.value = top
  try {
    localStorage.setItem(READ_KEY, String(top))
  } catch {
    /* تخزين محظور — العدّاد يعود عند إعادة التحميل فقط */
  }
}

function normalize(row: SaleEventRow): SaleEventRow {
  return {
    ...row,
    amount_egp: Number(row.amount_egp) || 0,
    total_egp: Number(row.total_egp) || 0,
    mute: Boolean(row.mute),
    duration_s: row.duration_s === null || row.duration_s === undefined ? null : Number(row.duration_s),
  }
}

// ------------------------------------------------------------ celebrations
function enqueue(fresh: SaleEventRow[]) {
  const cutoff = Date.now() - STALE_MS
  const recent = fresh.filter((e) => new Date(e.created_at).getTime() >= cutoff)

  // التهنئة اليدوية طلبها شخص صراحةً فتُعرض دائماً؛ الزيادات نأخذ أكبرها
  const manual = recent.filter((e) => e.kind === 'manual').slice(-MAX_CELEBRATIONS)
  const sales = recent
    .filter((e) => e.kind === 'sale')
    .sort((a, b) => b.amount_egp - a.amount_egp)
    .slice(0, MAX_CELEBRATIONS)

  const picked = [...manual, ...sales].sort((a, b) => a.id - b.id)
  if (!picked.length) return
  celebrations.value = [
    ...celebrations.value,
    ...picked.map((event) => ({ key: `${event.id}`, event })),
  ]
}

/** إعادة عرض إشعار قديم على هذه الشاشة وحدها. */
function replay(event: SaleEventRow) {
  celebrations.value = [...celebrations.value, { key: `${event.id}:${Date.now()}`, event }]
}

function dismissCelebration() {
  celebrations.value = celebrations.value.slice(1)
}

// ------------------------------------------------------------------ loading
async function load() {
  if (!hasSupabaseConfig) return
  const { data, error } = await supabase
    .from('lb_sale_events')
    .select('*')
    .order('id', { ascending: false })
    .limit(FEED_LIMIT)
  if (error) {
    console.warn('[useSaleEvents]', error.message)
    return
  }

  const rows = ((data ?? []) as SaleEventRow[]).map(normalize)
  const seen = lastSeenId
  const fresh = rows.filter((e) => e.id > seen && new Date(e.created_at).getTime() >= openedAt)
  if (fresh.length) enqueue(fresh)
  lastSeenId = Math.max(seen, rows[0]?.id ?? 0)
  events.value = rows
}

/** تهنئة يدوية تظهر على كل الشاشات المفتوحة — المسؤولون فقط (يتحقق الخادم). */
export interface CelebrateOptions {
  /** null = الأغنية الافتراضية */
  songId?: string | null
  mute?: boolean
  /** null = مدة الإعدادات */
  seconds?: number | null
}

async function celebrate(agentId: string, note: string, options: CelebrateOptions = {}) {
  const { error } = await supabase.rpc('lb_admin_celebrate', {
    p_agent_id: agentId,
    p_note: note.trim() || null,
    p_song_id: options.songId ?? null,
    p_mute: options.mute ?? false,
    p_seconds: options.seconds ?? null,
  })
  if (error) throw new Error(error.message)
}

// ------------------------------------------------------------------ realtime
let started = false
let batch: ReturnType<typeof setTimeout> | null = null

function scheduleLoad() {
  if (batch) clearTimeout(batch)
  batch = setTimeout(() => void load(), BATCH_MS)
}

function start() {
  if (started || !hasSupabaseConfig) return
  started = true
  void load()

  supabase
    .channel('leaderboard-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'leaderboard', table: 'sale_events' }, scheduleLoad)
    .subscribe()

  setInterval(() => void load(), FALLBACK_POLL_MS)
}

/** للوحة: يشترك في الأحداث ويغذّي الإشعارات والاحتفالات. */
export function useSaleEvents() {
  start()
  return {
    events,
    unreadCount,
    markAllRead,
    celebrations,
    dismissCelebration,
    replay,
  }
}

/** لصفحة الإدارة: إطلاق التهنئة فقط، بلا اشتراك. */
export function useCelebrate() {
  return { celebrate }
}
