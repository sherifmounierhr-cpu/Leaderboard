import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import { currentQuarter, drivePhotoUrl } from '@/lib/format'
import { i18n } from '@/i18n'
import type {
  AgentStanding,
  FeedStatus,
  RankHistoryPoint,
  Scope,
  TeamStanding,
} from '@/lib/types'

/** الشكل الموحّد الذي تستهلكه المكوّنات — الاسم مترجم مسبقاً. */
export interface BoardEntity {
  id: string
  name: string
  team?: string
  photo: string
  deals: number
  target: number
  pct: number
  members?: number
}

/** شبكة أمان: إن تعذّر الوصول للبيانات تُعرض هذه بدل شاشة فارغة على التلفزيون. */
const DEMO_TEAMS: BoardEntity[] = [
  { id: 'd1', name: 'New Capital', deals: 11_800_000, target: 13_000_000, pct: 91, members: 9, photo: '' },
  { id: 'd2', name: 'North Coast', deals: 9_600_000, target: 12_000_000, pct: 80, members: 8, photo: '' },
  { id: 'd3', name: 'Alexandria', deals: 8_100_000, target: 11_000_000, pct: 74, members: 7, photo: '' },
  { id: 'd4', name: 'New Alamein', deals: 7_400_000, target: 10_600_000, pct: 70, members: 8, photo: '' },
  { id: 'd5', name: 'Sheikh Zayed', deals: 6_300_000, target: 10_000_000, pct: 63, members: 6, photo: '' },
  { id: 'd6', name: 'Mostakbal City', deals: 5_700_000, target: 9_500_000, pct: 60, members: 7, photo: '' },
  { id: 'd7', name: 'Mansoura', deals: 4_700_000, target: 9_000_000, pct: 52, members: 5, photo: '' },
]

const DEMO_AGENTS: BoardEntity[] = [
  { id: 'a1', name: 'Omar Khaled', team: 'New Capital', deals: 3_400_000, target: 4_000_000, pct: 85, photo: '' },
  { id: 'a2', name: 'Mariam Adel', team: 'North Coast', deals: 2_800_000, target: 4_000_000, pct: 70, photo: '' },
  { id: 'a3', name: 'Youssef Hassan', team: 'Alexandria', deals: 2_500_000, target: 4_000_000, pct: 63, photo: '' },
  { id: 'a4', name: 'Nour Ibrahim', team: 'New Capital', deals: 2_200_000, target: 4_000_000, pct: 55, photo: '' },
  { id: 'a5', name: 'Karim Fouad', team: 'New Alamein', deals: 1_900_000, target: 4_000_000, pct: 48, photo: '' },
  { id: 'a6', name: 'Salma Tarek', team: 'North Coast', deals: 1_700_000, target: 4_000_000, pct: 43, photo: '' },
  { id: 'a7', name: 'Ahmed Samir', team: 'Sheikh Zayed', deals: 1_400_000, target: 4_000_000, pct: 35, photo: '' },
]

/** فاصل احتياطي: Realtime هو المصدر الأساسي، وهذا يلتقط أي حدث ضائع. */
const FALLBACK_POLL_MS = 120_000

// ------------------------------------------------------------------ state
const rawTeams = ref<TeamStanding[] | null>(null)
const rawAgents = ref<AgentStanding[] | null>(null)
const history = ref<RankHistoryPoint[]>([])
const quarterTotals = ref<TeamStanding[]>([])
const previousRanks = ref<Map<string, number>>(new Map())

const year = ref(new Date().getFullYear())
const calendarQuarter = ref(currentQuarter())
const quarter = ref(initialQuarter())
const quarterPinned = ref(new URLSearchParams(location.search).has('quarter'))

const loading = ref(false)
const error = ref<string | null>(null)
const updatedAt = ref<Date | null>(null)

function initialQuarter(): number {
  const raw = new URLSearchParams(location.search).get('quarter')
  const m = raw && String(raw).match(/^q?([1-4])$/i)
  return m ? Number(m[1]) : currentQuarter()
}

// ------------------------------------------------------------- localization
const locale = computed(() => i18n.global.locale.value)

function localName(name: string, nameAr: string | null | undefined): string {
  return locale.value === 'ar' && nameAr ? nameAr : name
}

/**
 * البيانات التجريبية شبكة أمان للتلفزيون، لا شاشة تحميل: تظهر فقط إن كان
 * الإعداد ناقصاً أو فشل الاتصال ولم ينجح ولا مرة. أثناء أول تحميل ناجح
 * تظهر حالة "لا نتائج" بدل ومضة أسماء وهمية.
 * `updatedAt` يُضبط عند أول نجاح فقط، فهو علامة "حمّلنا مرة على الأقل".
 */
const showDemo = computed(() => !hasSupabaseConfig || (Boolean(error.value) && !updatedAt.value))

const teams = computed<BoardEntity[]>(() => {
  if (!rawTeams.value) return showDemo.value ? DEMO_TEAMS : []
  return rawTeams.value.map((t) => ({
    id: t.team_id,
    name: localName(t.name, t.name_ar),
    photo: drivePhotoUrl(t.photo_url),
    deals: Number(t.deals) || 0,
    target: Number(t.target) || 0,
    pct: t.pct,
    members: t.members,
  }))
})

const agents = computed<BoardEntity[]>(() => {
  if (!rawAgents.value) return showDemo.value ? DEMO_AGENTS : []
  return rawAgents.value.map((a) => ({
    id: a.agent_id,
    name: localName(a.name, a.name_ar),
    team: a.team ? localName(a.team, a.team_ar) : '',
    photo: drivePhotoUrl(a.photo_url),
    deals: Number(a.deals) || 0,
    target: Number(a.target) || 0,
    pct: a.pct,
  }))
})

/**
 * فرق الترتيب مقابل آخر لقطة يومية — موجب = صعود.
 * محسوبة من قاعدة البيانات، فتصمد عبر إعادة تحميل الصفحة (على عكس الإصدار الأول).
 */
function deltasFor(list: TeamStanding[] | AgentStanding[] | null, scope: Scope) {
  const map = new Map<string, number>()
  if (!list) return map
  for (const row of list) {
    const id = scope === 'team' ? (row as TeamStanding).team_id : (row as AgentStanding).agent_id
    const before = previousRanks.value.get(`${scope}:${id}`)
    if (before != null) map.set(id, before - row.rank)
  }
  return map
}

const teamDeltas = computed(() => deltasFor(rawTeams.value, 'team'))
const agentDeltas = computed(() => deltasFor(rawAgents.value, 'agent'))

const status = computed<FeedStatus>(() => {
  if (showDemo.value) return 'demo'
  if (error.value) return 'reconnecting'
  return updatedAt.value ? 'live' : 'connecting'
})

// ------------------------------------------------------------------- loading
async function load() {
  if (!hasSupabaseConfig) {
    error.value = 'Supabase غير مضبوط'
    return
  }

  loading.value = true
  calendarQuarter.value = currentQuarter()
  if (!quarterPinned.value) quarter.value = calendarQuarter.value

  const y = year.value
  const q = quarter.value

  try {
    const [teamRes, agentRes, prevRes] = await Promise.all([
      supabase
        .from('lb_team_standings')
        .select('*')
        .eq('year', y)
        .eq('quarter', q)
        .order('rank', { ascending: true }),
      supabase
        .from('lb_agent_standings')
        .select('*')
        .eq('year', y)
        .eq('quarter', q)
        .order('rank', { ascending: true }),
      supabase
        .from('lb_previous_ranks')
        .select('scope, entity_id, rank')
        .eq('year', y)
        .eq('quarter', q),
    ])

    if (teamRes.error) throw teamRes.error
    if (agentRes.error) throw agentRes.error

    rawTeams.value = (teamRes.data ?? []) as TeamStanding[]
    rawAgents.value = (agentRes.data ?? []) as AgentStanding[]

    const prev = new Map<string, number>()
    for (const row of prevRes.data ?? []) {
      prev.set(`${row.scope}:${row.entity_id}`, row.rank)
    }
    previousRanks.value = prev

    updatedAt.value = new Date()
    error.value = null
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    console.warn('[useBoardData]', error.value)
  } finally {
    loading.value = false
  }
}

/** تاريخ الربع للرسوم البيانية — يُحمّل عند الطلب فقط. */
async function loadHistory() {
  if (!hasSupabaseConfig) return
  const { data, error: err } = await supabase
    .from('lb_rank_history')
    .select('*')
    .eq('year', year.value)
    .eq('quarter', quarter.value)
    .eq('scope', 'team')
    .order('taken_on', { ascending: true })
  if (!err) history.value = (data ?? []) as RankHistoryPoint[]
}

/** كل أرباع السنة للفروع — أساس رسم مقارنة الأرباع. */
async function loadQuarterTotals() {
  if (!hasSupabaseConfig) return
  const { data, error: err } = await supabase
    .from('lb_team_standings')
    .select('*')
    .eq('year', year.value)
    .order('quarter', { ascending: true })
  if (!err) quarterTotals.value = (data ?? []) as TeamStanding[]
}

function setQuarter(q: number) {
  if (q >= 1 && q <= calendarQuarter.value) {
    quarter.value = q
    quarterPinned.value = true
  }
}

// ------------------------------------------------------------------ realtime
let started = false
let channel: RealtimeChannel | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

function scheduleReload() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void load(), 400)
}

function start() {
  if (started) return
  started = true

  void load()
  void loadHistory()
  void loadQuarterTotals()

  if (hasSupabaseConfig) {
    channel = supabase
      .channel('leaderboard-sales')
      .on(
        'postgres_changes',
        { event: '*', schema: 'leaderboard', table: 'sales' },
        scheduleReload,
      )
      .subscribe()
  }

  // احتياطي: يلتقط أي تغيير فات الاشتراك، وأخف بكثير من polling الإصدار الأول
  setInterval(() => void load(), FALLBACK_POLL_MS)

  watch(quarter, () => {
    void load()
    void loadHistory()
  })
}

export function useBoardData() {
  start()
  return {
    teams,
    agents,
    history,
    quarterTotals,
    quarter,
    calendarQuarter,
    year,
    setQuarter,
    loading,
    error,
    updatedAt,
    status,
    teamDeltas,
    agentDeltas,
    reload: load,
    loadHistory,
    loadQuarterTotals,
    channel: () => channel,
  }
}
