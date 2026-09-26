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

  async function addDeal(
    agentId: string, date: string, amount: number, developer = '', project = '',
  ): Promise<AddedDeal> {
    const { data, error } = await supabase.rpc('lb_admin_add_deal', {
      p_agent_id: agentId,
      p_date: date,
      p_amount: amount,
      p_developer: developer.trim() || null,
      p_project: project.trim() || null,
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

  return {
    deals,
    loading,
    load,
    addDeal,
    deleteDeal,
    developers: computed(() => names.value.filter((n) => n.kind === 'developer').map((n) => n.value)),
    projects: computed(() => names.value.filter((n) => n.kind === 'project').map((n) => n.value)),
  }
}
