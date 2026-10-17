import { computed, ref } from 'vue'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'
import type { Owner, OwnerMessage } from '@/lib/types'

/**
 * كلمة أصحاب العمل. الإدارة بتبعت، والشاشات بتسمع لحظياً وتعرض كل كلمة
 * جديدة مرة واحدة. شاشة كانت مقفولة ما بتعرضش كلام قديم لما تفتح: نافذة
 * الكلمة دقايق قليلة بس، زي الاحتفالات.
 */

const STALE_MS = 3 * 60_000
const FALLBACK_POLL_MS = 2 * 60_000
const SEEN_KEY = 'everest.owner-messages.seen'
const SEEN_MAX = 100

const owners = ref<Owner[]>([])
const messages = ref<OwnerMessage[]>([])
/** الطابور على الشاشة دي: الأقدم أولاً. */
const queue = ref<Array<{ key: string; message: OwnerMessage; preview?: boolean }>>([])
const seen = new Set<string>(readSeen())

function readSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}
function markSeen(id: string) {
  seen.add(id)
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_MAX))) } catch { /* تخزين محظور */ }
}

function normalize(m: OwnerMessage): OwnerMessage {
  return { ...m, slot: Number(m.slot) as 1 | 2, audio_seconds: m.audio_seconds == null ? null : Number(m.audio_seconds) }
}

async function loadOwners() {
  if (!hasSupabaseConfig) return
  const { data, error } = await supabase.from('lb_owners').select('*').order('slot')
  if (error) {
    console.warn('[owners]', error.message)
    return
  }
  owners.value = ((data ?? []) as Owner[]).map((o) => ({ ...o, slot: Number(o.slot) as 1 | 2 }))
}

async function loadMessages() {
  if (!hasSupabaseConfig) return
  const { data, error } = await supabase.from('lb_owner_messages').select('*').order('created_at', { ascending: false })
  if (error) {
    console.warn('[owner-messages]', error.message)
    return
  }
  messages.value = ((data ?? []) as OwnerMessage[]).map(normalize)
}

/** الجديد اللي لسه ما اتعرضش على الشاشة دي — بترتيب إرساله. */
function enqueueFresh() {
  const cutoff = Date.now() - STALE_MS
  const fresh = messages.value
    .filter((m) => !seen.has(m.id) && new Date(m.created_at).getTime() >= cutoff)
    .reverse()
  for (const m of fresh) {
    markSeen(m.id)
    queue.value = [...queue.value, { key: m.id, message: m }]
  }
}

let started = false
function start() {
  if (started || !hasSupabaseConfig) return
  started = true
  void loadOwners()
  void loadMessages().then(enqueueFresh)
  supabase
    .channel('leaderboard-owners')
    .on('postgres_changes', { event: 'INSERT', schema: 'leaderboard', table: 'owner_messages' }, () => {
      void loadMessages().then(enqueueFresh)
    })
    .on('postgres_changes', { event: '*', schema: 'leaderboard', table: 'owners' }, () => void loadOwners())
    .subscribe()
  setInterval(() => void loadMessages().then(enqueueFresh), FALLBACK_POLL_MS)
}

function dismiss() {
  queue.value = queue.value.slice(1)
}

/** معاينة على الجهاز ده بس — من غير ما توصل للشاشات. */
function preview(message: OwnerMessage) {
  queue.value = [{ key: `preview:${Date.now()}`, message, preview: true }]
}

// ------------------------------------------------------------ الإدارة
async function saveOwner(o: Owner) {
  const { error } = await supabase.rpc('lb_admin_owner_save', {
    p_slot: o.slot,
    p_name: o.name,
    p_name_ar: o.name_ar,
    p_title: o.title,
    p_title_ar: o.title_ar,
    p_photo_url: o.photo_url,
  })
  if (error) throw new Error(error.message)
  await loadOwners()
}

export interface OwnerDraft {
  slot: 1 | 2
  body: string
  audioUrl: string | null
  audioSeconds: number | null
  toAgent: string | null
  toTeam: string | null
}

async function send(d: OwnerDraft) {
  const { error } = await supabase.rpc('lb_admin_owner_send', {
    p_slot: d.slot,
    p_body: d.body,
    p_audio_url: d.audioUrl,
    p_audio_seconds: d.audioSeconds,
    p_to_agent: d.toAgent,
    p_to_team: d.toTeam,
  })
  if (error) throw new Error(error.message)
  await loadMessages()
}

async function removeMessage(id: string) {
  const { error } = await supabase.rpc('lb_admin_owner_delete_message', { p_id: id })
  if (error) throw new Error(error.message)
  await loadMessages()
}

/** صوت الرسالة في مخزن الصوت، باسم مستقل (التسجيل المباشر webm، وسفاري mp4). */
async function uploadVoice(blob: Blob) {
  // المخزن بيقارن النوع من غير بارامترات (audio/webm;codecs=opus ← audio/webm)
  const type = (blob.type || 'audio/webm').split(';')[0]
  const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') || type.includes('mp3') ? 'mp3' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'
  const path = `owner-voice/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType: type, upsert: false })
  if (error) throw new Error(error.message)
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

/**
 * @param board true على اللوحة: بيشترك ويعرض الجديد. في الإدارة بيحمّل بس —
 * الجدولة هناك كانت هتعلّم الرسالة «اتعرضت» على تبويب اللوحة في نفس الجهاز.
 */
export function useOwners({ board = false }: { board?: boolean } = {}) {
  if (board) start()
  return {
    owners,
    messages,
    current: computed(() => queue.value[0] ?? null),
    dismiss,
    preview,
    reload: () => Promise.all([loadOwners(), loadMessages()]),
    saveOwner,
    send,
    removeMessage,
    uploadVoice,
  }
}
