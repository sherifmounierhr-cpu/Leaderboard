import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { DirectorRow } from '@/lib/types'

/**
 * مديرو الشركة — قائمة ثابتة تُدار من الإدارة مرة، وتُعرض في افتتاحية
 * احتفال نهاية الربع (كلمة الإدارة + صور المديرين).
 */

const directors = ref<DirectorRow[]>([])
const loading = ref(false)
const saveError = ref<string | null>(null)

function fail(error: unknown): never {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  saveError.value = message
  throw new Error(message)
}

async function load() {
  loading.value = true
  saveError.value = null
  try {
    const { data, error } = await supabase.from('lb_directors').select('*').order('position')
    if (error) fail(error)
    directors.value = (data ?? []) as DirectorRow[]
  } finally {
    loading.value = false
  }
}

export interface DirectorDraft {
  id?: string | null
  name: string
  name_ar: string | null
  title: string
  title_ar: string | null
  photo_url: string | null
  position: number
  active: boolean
}

async function saveDirector(d: DirectorDraft) {
  const { error } = await supabase.rpc('lb_admin_save_director', {
    p_id: d.id ?? null,
    p_name: d.name,
    p_name_ar: d.name_ar,
    p_title: d.title,
    p_title_ar: d.title_ar,
    p_photo_url: d.photo_url,
    p_position: d.position,
    p_active: d.active,
  })
  if (error) fail(error)
  await load()
}

async function deleteDirector(id: string) {
  const { error } = await supabase.rpc('lb_admin_delete_director', { p_id: id })
  if (error) fail(error)
  await load()
}

export function useDirectors() {
  return { directors, loading, saveError, load, saveDirector, deleteDirector }
}
