import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { HiddenNews, NewsCast } from '@/lib/types'

/**
 * التحكم في الأخبار من صفحة الإدارة، بيوصل الشاشات لحظياً:
 * - قائمة الأخبار المخفيّة، فالشاشة تشيلها وهي بتعرض.
 * - بثّ خبر فوراً على كل الشاشات.
 *
 * الأخبار نفسها مش مخزّنة عندنا، فالإخفاء بمعرّف المقال في ووردبريس، والبثّ
 * بيخزّن نص الخبر وصورته وقتها عشان يشتغل حتى لو الخبر خرج من آخر عشرة.
 */

const FALLBACK_POLL_MS = 5 * 60_000

const hidden = ref<HiddenNews[]>([])
const casts = ref<NewsCast[]>([])
const loaded = ref(false)

let started = false

async function load() {
  if (!hasSupabaseConfig) return
  const [h, c] = await Promise.all([
    supabase.from('lb_news_hidden').select('*'),
    supabase.from('lb_news_casts').select('*').limit(20),
  ])
  if (!h.error) hidden.value = ((h.data ?? []) as HiddenNews[]).map((r) => ({ ...r, post_id: Number(r.post_id) }))
  if (!c.error) casts.value = ((c.data ?? []) as NewsCast[]).map((r) => ({ ...r, post_id: Number(r.post_id) }))
  loaded.value = true
}

function start() {
  if (started || !hasSupabaseConfig) return
  started = true
  void load()
  supabase
    .channel('leaderboard-news-controls')
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'news_hidden' }, () => void load())
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'news_casts' }, () => void load())
    .subscribe()
  // صفحة الإدارة بتبدأ قبل تسجيل الدخول: القراءة الأولى بترجع فاضية
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void load()
  })
  setInterval(() => void load(), FALLBACK_POLL_MS)
}

export function useNewsControls() {
  start()
  return {
    hidden: computed(() => hidden.value),
    hiddenIds: computed(() => new Set(hidden.value.map((row) => row.post_id))),
    /** آخر بثّ، الشاشة بتقارن معرّفه باللي عرضته قبل كده. */
    latestCast: computed(() => casts.value[0] ?? null),
    loaded: computed(() => loaded.value),
    reload: load,

    async hide(postId: number, title: string) {
      const { error } = await supabase.rpc('lb_admin_hide_news', { p_post_id: postId, p_title: title })
      if (error) throw new Error(error.message)
      await load()
    },
    async show(postId: number) {
      const { error } = await supabase.rpc('lb_admin_show_news', { p_post_id: postId })
      if (error) throw new Error(error.message)
      await load()
    },
    async cast(item: { id: number; title: string; excerpt: string; image: string | null; url: string }) {
      const { error } = await supabase.rpc('lb_admin_cast_news', {
        p_post_id: item.id,
        p_title: item.title,
        p_excerpt: item.excerpt,
        p_image: item.image,
        p_url: item.url,
      })
      if (error) throw new Error(error.message)
      await load()
    },
  }
}
