import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { currentQuarter } from '@/lib/format'
import { exportWorkbook, parseWorkbook, type ImportSummary } from '@/lib/workbook'

export interface AdminTeam {
  id: string
  name: string
  name_ar: string | null
  photo_url: string | null
  active: boolean
  /** بترتيب الإدخال — الأول يظهر أولاً على البطاقة. */
  manager_ids: string[]
  supervisor_ids: string[]
}

export interface AdminAgent {
  id: string
  name: string
  name_ar: string | null
  team_id: string | null
  /** الإنجليزي مفتاح الربط في التصدير والمزامنة؛ العربي للعرض فقط. */
  team_name: string | null
  team_name_ar: string | null
  photo_url: string | null
  active: boolean
}

export interface AdminPeriod {
  agent_id: string
  year: number
  quarter: number
  target_egp: number
  amount_egp: number
}

const teams = ref<AdminTeam[]>([])
const agents = ref<AdminAgent[]>([])
const periods = ref<Map<string, AdminPeriod>>(new Map())

const year = ref(new Date().getFullYear())
const quarter = ref(currentQuarter())
const loading = ref(false)
const saveError = ref<string | null>(null)

/** رسالة الخطأ من قاعدة البيانات مباشرة — نصوصها عربية ومكتوبة للمستخدم. */
function fail(error: unknown): never {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  saveError.value = message
  throw new Error(message)
}

async function loadRoster() {
  loading.value = true
  saveError.value = null
  try {
    const [teamRes, agentRes] = await Promise.all([
      supabase.from('lb_teams').select('*').order('name'),
      supabase.from('lb_agents').select('*').order('name'),
    ])
    if (teamRes.error) fail(teamRes.error)
    if (agentRes.error) fail(agentRes.error)
    teams.value = (teamRes.data ?? []) as AdminTeam[]
    agents.value = (agentRes.data ?? []) as AdminAgent[]
  } finally {
    loading.value = false
  }
}

async function loadPeriods() {
  const { data, error } = await supabase
    .from('lb_periods')
    .select('*')
    .eq('year', year.value)
    .eq('quarter', quarter.value)
  if (error) fail(error)
  const map = new Map<string, AdminPeriod>()
  for (const row of (data ?? []) as AdminPeriod[]) {
    map.set(row.agent_id, {
      ...row,
      target_egp: Number(row.target_egp) || 0,
      amount_egp: Number(row.amount_egp) || 0,
    })
  }
  periods.value = map
}

export function useAdminData() {
  async function reload() {
    await loadRoster()
    await loadPeriods()
  }

  /**
   * الفريق وقيادته في نداءين: الحفظ يرجّع المعرّف، وهو لازم لفريق جديد قبل
   * ربط مديره. لو فشل الثاني يبقى الفريق محفوظاً وتظهر رسالة الخطأ.
   */
  async function saveTeam(team: Partial<AdminTeam> & { name: string }) {
    const { data, error } = await supabase.rpc('lb_admin_save_team', {
      p_id: team.id ?? null,
      p_name: team.name,
      p_name_ar: team.name_ar ?? null,
      p_photo_url: team.photo_url ?? null,
      p_active: team.active ?? true,
    })
    if (error) fail(error)

    const teamId = (data as string | null) ?? team.id
    if (teamId && (team.manager_ids || team.supervisor_ids)) {
      const leads = await supabase.rpc('lb_admin_set_team_leads', {
        p_team_id: teamId,
        p_manager_ids: team.manager_ids ?? [],
        p_supervisor_ids: team.supervisor_ids ?? [],
      })
      if (leads.error) {
        await loadRoster()
        fail(leads.error)
      }
    }
    await loadRoster()
  }

  async function deleteTeam(id: string) {
    const { error } = await supabase.rpc('lb_admin_delete_team', { p_id: id })
    if (error) fail(error)
    await loadRoster()
  }

  async function saveAgent(agent: Partial<AdminAgent> & { name: string }) {
    const { error } = await supabase.rpc('lb_admin_save_agent', {
      p_id: agent.id ?? null,
      p_name: agent.name,
      p_name_ar: agent.name_ar ?? null,
      p_team_id: agent.team_id ?? null,
      p_photo_url: agent.photo_url ?? null,
      p_active: agent.active ?? true,
    })
    if (error) fail(error)
    await loadRoster()
  }

  async function deleteAgent(id: string) {
    const { error } = await supabase.rpc('lb_admin_delete_agent', { p_id: id })
    if (error) fail(error)
    await reload()
  }

  async function savePeriod(agentId: string, target: number, deals: number) {
    const { error } = await supabase.rpc('lb_admin_save_period', {
      p_agent_id: agentId,
      p_year: year.value,
      p_quarter: quarter.value,
      p_target: target,
      p_deals: deals,
    })
    if (error) fail(error)
    periods.value = new Map(periods.value).set(agentId, {
      agent_id: agentId,
      year: year.value,
      quarter: quarter.value,
      target_egp: target,
      amount_egp: deals,
    })
  }

  async function setQuarter(q: number) {
    quarter.value = q
    await loadPeriods()
  }

  /**
   * رفع صورة إلى مخزن Supabase.
   * اسم الملف يحمل طابعاً زمنياً حتى لا يعرض المتصفح نسخة مخبأة قديمة بعد
   * استبدال صورة الشخص نفسه.
   */
  async function uploadPhoto(file: File, kind: 'team' | 'agent', id: string | null) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    // السجل الجديد لا معرّف له بعد، فنولّد مساراً مستقلاً للصورة
    const key = id ?? crypto.randomUUID()
    const path = `${kind}s/${key}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (error) fail(error)
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  }

  /** التصدير يشمل السنة كاملة لا الربع المعروض فقط. */
  async function exportYear() {
    const { data, error } = await supabase
      .from('lb_periods')
      .select('*')
      .eq('year', year.value)
    if (error) fail(error)

    const byAgent = new Map<string, { quarter: number; target: number; deals: number }[]>()
    for (const row of (data ?? []) as AdminPeriod[]) {
      const list = byAgent.get(row.agent_id) ?? []
      list.push({
        quarter: Number(row.quarter),
        target: Number(row.target_egp) || 0,
        deals: Number(row.amount_egp) || 0,
      })
      byAgent.set(row.agent_id, list)
    }

    await exportWorkbook(
      {
        teams: teams.value.map((t) => ({
          name: t.name,
          name_ar: t.name_ar,
          photo_url: t.photo_url,
        })),
        agents: agents.value.map((a) => ({
          name: a.name,
          name_ar: a.name_ar,
          team: a.team_name,
          photo_url: a.photo_url,
          periods: byAgent.get(a.id) ?? [],
        })),
      },
      year.value,
    )
  }

  /**
   * الاستيراد يحدّث ويضيف فقط — لا يحذف أحداً. يمر عبر lb_admin_import
   * المحروسة، وهي نفس منطق مزامنة جوجل شيت، في نداء واحد.
   */
  async function importFile(file: File): Promise<ImportSummary> {
    saveError.value = null
    const { payload, summary } = await parseWorkbook(file)

    const { error } = await supabase.rpc('lb_admin_import', {
      p_year: year.value,
      p_payload: payload,
    })
    if (error) fail(error)

    await reload()
    return summary
  }

  return {
    teams,
    agents,
    periods,
    year,
    quarter,
    loading,
    saveError,
    reload,
    exportYear,
    importFile,
    loadPeriods,
    setQuarter,
    saveTeam,
    deleteTeam,
    saveAgent,
    deleteAgent,
    savePeriod,
    uploadPhoto,
  }
}
