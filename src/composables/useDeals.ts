import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { DealName, DealRow } from '@/lib/types'
import { useAdminData } from './useAdminData'

/**
 * الصفقات: إدخال المبيعات صفقة صفقة. الإضافة بتزوّد إجمالي الربع على الخادم،
 * والاحتفال بيظهر لوحده على الشاشات لو الصفقة في الربع الجاري.
 */

const LIMIT = 60

const deals = ref<DealRow[]>([])
const names = ref<DealName[]>([])
const loading = ref(false)

export interface AddedDeal {
  id: string
  year: number
  quarter: number
  total_egp: number
  /** نصيب المستشار الأول (= المبلغ كله لو الصفقة غير مشتركة). */
  amount_egp: number
  /** نصيب المستشار المشارك — null لو الصفقة غير مشتركة. */
  partner_amount_egp: number | null
  /** هل ظهر الاحتفال على الشاشات؟ (الربع الجاري فقط) */
  celebrated: boolean
}

async function load() {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('lb_deals')
      .select('*')
      .order('deal_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (error) throw new Error(error.message)
    deals.value = ((data ?? []) as DealRow[]).map((d) => ({ ...d, amount_egp: Number(d.amount_egp) || 0 }))

    // الاقتراحات من كل الصفقات، مش من الستين المعروضين بس
    const suggestions = await supabase.from('lb_deal_names').select('*').order('uses', { ascending: false })
    if (!suggestions.error) names.value = (suggestions.data ?? []) as DealName[]
  } finally {
    loading.value = false
  }
}

export function useDeals() {
  const admin = useAdminData()

  /**
   * إضافة صفقة، أو تعديل صفقة موجودة لو اتبعت editId. التعديل بيعكس القديمة
   * ويسجّلها من جديد على الخادم في عملية واحدة، ومن غير احتفال.
   */
  async function addDeal(
    agentId: string, date: string, amount: number, developer = '', project = '', teamId = '',
    shared: { partnerId: string; partnerTeamId: string; share: number } | null = null,
    editId = '',
  ): Promise<AddedDeal> {
    const { data, error } = await supabase.rpc(editId ? 'lb_admin_update_deal' : 'lb_admin_add_deal', {
      ...(editId ? { p_id: editId } : {}),
      p_agent_id: agentId,
      p_date: date,
      p_amount: amount,
      p_developer: developer.trim() || null,
      p_project: project.trim() || null,
      // فاضي = فريق المستشار الحالي
      p_team_id: teamId || null,
      p_partner_id: shared?.partnerId || null,
      p_partner_team_id: shared?.partnerTeamId || null,
      // نسبة المستشار الأول؛ الباقي للمشارك
      p_share_pct: shared ? shared.share : null,
    })
    if (error) throw new Error(error.message)
    await Promise.all([load(), admin.loadPeriods()])
    return data as AddedDeal
  }

  async function deleteDeal(id: string) {
    const { error } = await supabase.rpc('lb_admin_delete_deal', { p_id: id })
    if (error) throw new Error(error.message)
    await Promise.all([load(), admin.loadPeriods()])
  }

  /** نصفا الصفقة المشتركة — من القاعدة، لأن الشريك قد يكون خارج القائمة المعروضة. */
  async function sharedParts(sharedId: string): Promise<DealRow[]> {
    const { data, error } = await supabase.from('lb_deals').select('*').eq('shared_id', sharedId)
    if (error) throw new Error(error.message)
    return ((data ?? []) as DealRow[]).map((d) => ({ ...d, amount_egp: Number(d.amount_egp) || 0 }))
  }

  /** إجمالي مبيعات المستشار في ربع، ومجموع صفقاته المسجّلة فيه (الفرق = مبيعات غير مفصّلة). */
  async function quarterTotals(agentId: string, year: number, quarter: number) {
    const [period, rows] = await Promise.all([
      supabase.from('lb_periods').select('amount_egp').eq('agent_id', agentId).eq('year', year).eq('quarter', quarter),
      supabase.from('lb_deals').select('amount_egp').eq('agent_id', agentId).eq('year', year).eq('quarter', quarter),
    ])
    if (period.error) throw new Error(period.error.message)
    if (rows.error) throw new Error(rows.error.message)
    const sum = (list: { amount_egp: number }[] | null) =>
      Math.round((list ?? []).reduce((s, r) => s + (Number(r.amount_egp) || 0), 0) * 100) / 100
    return { total: sum(period.data), dealsSum: sum(rows.data) }
  }

  /** ضبط إجمالي ربع المستشار — الخادم بيرفض أقل من مجموع صفقاته، ومن غير احتفال. */
  async function setTotal(agentId: string, year: number, quarter: number, total: number) {
    const { error } = await supabase.rpc('lb_admin_set_total', {
      p_agent_id: agentId,
      p_year: year,
      p_quarter: quarter,
      p_total: total,
    })
    if (error) throw new Error(error.message)
    await admin.loadPeriods()
  }

  return {
    deals,
    loading,
    quarterTotals,
    setTotal,
    sharedParts,
    load,
    addDeal,
    deleteDeal,
    developers: computed(() => names.value.filter((n) => n.kind === 'developer').map((n) => n.value)),
    projects: computed(() => names.value.filter((n) => n.kind === 'project').map((n) => n.value)),
  }
}
