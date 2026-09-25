import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { BoardSettings, MediaFile } from '@/lib/types'

/**
 * إعدادات العرض (مدة الاحتفال، الأغنية الافتراضية، مستوى الصوت) ومكتبة
 * الصوتيات. حالة مشتركة: اللوحة وصفحة الإدارة يقرآن نفس النسخة، وأي تعديل
 * من الإدارة يوصل الشاشات لحظياً عبر Realtime.
 */

export const DEFAULT_SETTINGS: BoardSettings = {
  celebration_seconds: 8, celebration_song_id: null, volume: 80,
  news_enabled: true, news_slide_s: 9, news_repeats: 3, news_gap_min: 5,
  news_chime: true, news_volume: 70, news_sound_id: null,
}
export const MEDIA_BUCKET = 'media'
const FALLBACK_POLL_MS = 5 * 60_000

const settings = ref<BoardSettings>({ ...DEFAULT_SETTINGS })
const media = ref<MediaFile[]>([])
const loaded = ref(false)

let started = false

async function load() {
  if (!hasSupabaseConfig) return
  const [s, m] = await Promise.all([
    supabase.from('lb_board_settings').select('*').maybeSingle(),
    supabase.from('lb_media_files').select('*').order('created_at', { ascending: false }),
  ])
  if (!s.error && s.data) {
    const row = s.data as BoardSettings
    settings.value = {
      celebration_seconds: Number(row.celebration_seconds) || DEFAULT_SETTINGS.celebration_seconds,
      celebration_song_id: row.celebration_song_id,
      volume: Number(row.volume ?? DEFAULT_SETTINGS.volume),
      cbe_deposit: row.cbe_deposit === null || row.cbe_deposit === undefined ? null : Number(row.cbe_deposit),
      cbe_lending: row.cbe_lending === null || row.cbe_lending === undefined ? null : Number(row.cbe_lending),
      cbe_rates_at: row.cbe_rates_at ?? null,
      news_enabled: row.news_enabled ?? true,
      news_slide_s: Number(row.news_slide_s) || 9,
      news_repeats: Number(row.news_repeats) || 3,
      news_gap_min: Number(row.news_gap_min) || 5,
      news_chime: row.news_chime ?? true,
      news_volume: Number(row.news_volume ?? 70),
      news_sound_id: row.news_sound_id ?? null,
    }
  }
  if (!m.error) {
    media.value = ((m.data ?? []) as MediaFile[]).map((f) => ({
      ...f,
      duration_s: f.duration_s === null ? null : Number(f.duration_s),
      size_bytes: Number(f.size_bytes) || 0,
    }))
  }
  loaded.value = true
}

function start() {
  if (started || !hasSupabaseConfig) return
  started = true
  void load()
  supabase
    .channel('leaderboard-media')
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'board_settings' }, () => void load())
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'media_files' }, () => void load())
    .subscribe()
  // صفحة الإدارة بتبدأ قبل تسجيل الدخول: القراءة الأولى بترجع فاضية
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void load()
  })
  setInterval(() => void load(), FALLBACK_POLL_MS)
}

export function mediaUrl(path: string) {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

export function useBoardMedia() {
  start()
  const byId = computed(() => new Map(media.value.map((f) => [f.id, f])))
  const songs = computed(() => media.value.filter((f) => f.kind === 'song'))
  const clips = computed(() => media.value.filter((f) => f.kind === 'clip'))

  /** رابط ملف صوت بالمعرّف، أو null لو اتمسح. */
  const urlOf = (id: string | null | undefined) => {
    const file = id ? byId.value.get(id) : undefined
    return file ? mediaUrl(file.path) : null
  }

  return { settings, media, songs, clips, byId, urlOf, loaded, reload: load }
}
