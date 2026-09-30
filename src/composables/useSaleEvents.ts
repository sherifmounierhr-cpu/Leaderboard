import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { SaleEventRow, TeamEventRow } from '@/lib/types'

/**
 * عدد الإشعارات المعروضة في القائمة. أعلى من المعتاد بكتير عشان دفعة احتفال
 * نهاية الربع (فرق + مديرون + كل المستشارين) ما تتقصش لو زادت عن عدد صغير.
 */
const FEED_LIMIT = 250
/** نفس الفكرة لاحتفالات الفرق — عددها بطبيعته أقل بكتير من المستشارين. */
const TEAM_FEED_LIMIT = 100

/**
 * حفظ صف كامل من الإدارة أو استيراد ملف قد يولّد أحداثاً كثيرة دفعة واحدة.
 * نحتفل بأكبرها فقط حتى لا تُحجب اللوحة دقائق — والباقي يبقى في الإشعارات.
 * احتفال نهاية الربع (kind: 'quarter') مقصود أن يُحتفل بكل صف فيه، فيتخطى
 * الحد ده عمداً — طلبها المسؤول بنفسه لحظة الإطلاق، مش تدفّق تلقائي.
 */
const MAX_CELEBRATIONS = 3
/** سقف احتفالات نهاية الربع في دفعة واحدة — يكفي أكبر فريق ومستشارين. */
const MAX_QUARTER_CELEBRATIONS = 250

/**
 * حدث أقدم من هذا لا يُحتفل به عند وصوله: شاشة نامت أو فقدت الاتصال ساعة
 * ثم عادت لا يجب أن تفرّغ طابوراً من احتفالات قديمة. يبقى ظاهراً في القائمة.
 */
const STALE_MS = 10 * 60_000

/** الأحداث المتتالية في نفس الحفظ تصل كرسائل منفصلة؛ ننتظر قليلاً لنجمعها. */
const BATCH_MS = 600
const FALLBACK_POLL_MS = 120_000
const READ_KEY = 'everest-leaderboard:notifications-read'

export type Celebration =
  | { key: string; scope: 'agent'; event: SaleEventRow }
  | { key: string; scope: 'team'; event: TeamEventRow }

// ------------------------------------------------------------------ state
const events = ref<SaleEventRow[]>([])
const celebrations = ref<Celebration[]>([])
const lastReadId = ref(readStoredId())

/** أعلى معرّف رأيناه — يمنع الاحتفال بنفس الحدث مرتين. */
let lastSeenId = 0
/** نفس الفكرة لاحتفالات الفرق، بمعزل عن أحداث المستشارين. */
let lastSeenTeamId = 0

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

function normalizeTeam(row: TeamEventRow): TeamEventRow {
  return {
    ...row,
    total_egp: Number(row.total_egp) || 0,
    mute: Boolean(row.mute),
    duration_s: row.duration_s === null || row.duration_s === undefined ? null : Number(row.duration_s),
    managers: row.managers ?? [],
  }
}

// ------------------------------------------------------------ celebrations
function enqueue(fresh: SaleEventRow[], freshTeams: TeamEventRow[] = []) {
  const cutoff = Date.now() - STALE_MS
  const recent = fresh.filter((e) => new Date(e.created_at).getTime() >= cutoff)
  const recentTeams = freshTeams.filter((e) => new Date(e.created_at).getTime() >= cutoff)

  // احتفال نهاية الربع طلبه المسؤول عمداً لكل من يستحقه — لا يُقصر كباقي الأنواع
  const quarter = recent.filter((e) => e.kind === 'quarter').slice(0, MAX_QUARTER_CELEBRATIONS)
  // التهنئة اليدوية طلبها شخص صراحةً فتُعرض دائماً؛ الزيادات نأخذ أكبرها
  const manual = recent.filter((e) => e.kind === 'manual').slice(-MAX_CELEBRATIONS)
  const sales = recent
    .filter((e) => e.kind === 'sale')
    .sort((a, b) => b.amount_egp - a.amount_egp)
    .slice(0, MAX_CELEBRATIONS)

  // ترتيب العرض: احتفال الفرق (وترتيبها هو ترتيب مديريها بعدها) ثم الأفراد
  const teamCelebrations: Celebration[] = recentTeams
    .slice(0, MAX_QUARTER_CELEBRATIONS)
    .map((event) => ({ key: `team:${event.id}`, scope: 'team' as const, event }))
  const picked = [...quarter, ...manual, ...sales].sort((a, b) => a.id - b.id)
  const agentCelebrations: Celebration[] = picked.map((event) => ({
    key: `agent:${event.id}`,
    scope: 'agent' as const,
    event,
  }))

  if (!teamCelebrations.length && !agentCelebrations.length) return
  celebrations.value = [...celebrations.value, ...teamCelebrations, ...agentCelebrations]
}

/** إعادة عرض إشعار قديم على هذه الشاشة وحدها. */
function replay(event: SaleEventRow) {
  celebrations.value = [...celebrations.value, { key: `agent:${event.id}:${Date.now()}`, scope: 'agent', event }]
}

function dismissCelebration() {
  celebrations.value = celebrations.value.slice(1)
}

// ------------------------------------------------------------------ loading
async function loadTeams(): Promise<TeamEventRow[]> {
  const { data, error } = await supabase
    .from('lb_team_events')
    .select('*')
    .order('id', { ascending: false })
    .limit(TEAM_FEED_LIMIT)
  if (error) {
    console.warn('[useSaleEvents:teams]', error.message)
    return []
  }
  const rows = ((data ?? []) as TeamEventRow[]).map(normalizeTeam)
  const seen = lastSeenTeamId
  const fresh = rows.filter((e) => e.id > seen && new Date(e.created_at).getTime() >= openedAt)
  lastSeenTeamId = Math.max(seen, rows[0]?.id ?? 0)
  return fresh
}

async function load() {
  if (!hasSupabaseConfig) return
  const [{ data, error }, freshTeams] = await Promise.all([
    supabase.from('lb_sale_events').select('*').order('id', { ascending: false }).limit(FEED_LIMIT),
    loadTeams(),
  ])
  if (error) {
    console.warn('[useSaleEvents]', error.message)
    return
  }

  const rows = ((data ?? []) as SaleEventRow[]).map(normalize)
  const seen = lastSeenId
  const fresh = rows.filter((e) => e.id > seen && new Date(e.created_at).getTime() >= openedAt)
  if (fresh.length || freshTeams.length) enqueue(fresh, freshTeams)
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

export interface QuarterCelebrationCounts {
  teams: number
  managers: number
  agents: number
}

/** احتفال نهاية الربع: فريق لكل فريق باع، وفردي لكل مدير ولكل مستشار باع. */
async function celebrateQuarter(
  year: number,
  quarter: number,
  teamNote: string,
  agentNote: string,
): Promise<QuarterCelebrationCounts> {
  const { data, error } = await supabase.rpc('lb_admin_celebrate_quarter', {
    p_year: year,
    p_quarter: quarter,
    p_team_note: teamNote.trim() || null,
    p_agent_note: agentNote.trim() || null,
  })
  if (error) throw new Error(error.message)
  return data as QuarterCelebrationCounts
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
    .on('postgres_changes', { event: 'INSERT', schema: 'leaderboard', table: 'team_events' }, scheduleLoad)
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
  return { celebrate, celebrateQuarter }
}
