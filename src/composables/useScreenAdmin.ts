import { supabase } from '@/lib/supabase'
import type { Announcement, AnnouncementLogo, MediaFile } from '@/lib/types'
import { MEDIA_BUCKET, useBoardMedia } from './useBoardMedia'
import { useAnnouncements } from './useAnnouncements'

/**
 * كتابات صفحة الإدارة الخاصة بالشاشة: الصوتيات، إعدادات الاحتفال، والرسائل.
 * كل الكتابة عبر دوال محروسة؛ رسائل الخطأ عربية من الخادم وتتعرض كما هي.
 */

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

/** مدة الملف بالثواني من الـ metadata — قبل الرفع، عشان تظهر في المكتبة. */
export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (value: number | null) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}

export interface AnnouncementDraft {
  id: string | null
  style: Announcement['style']
  title: string
  body: string
  duration_s: number
  clip_id: string | null
  schedule: Announcement['schedule']
  /** ISO — للمرة الواحدة؛ null = الآن */
  starts_at: string | null
  daily_time: string
  weekdays: number[]
  active: boolean
  image_url: string | null
  subtitle: string
  logos: AnnouncementLogo[]
}

const ANNOUNCE_BUCKET = 'announcements'
/** أطول ضلع بعد التصغير: صورة الرسالة تملأ نص شاشة 1080، والشعار أصغر بكتير. */
const IMAGE_EDGE = { image: 1600, logo: 720 } as const

/**
 * تصغير الصورة في المتصفح قبل الرفع: صورة موبايل 12 ميجابكسل كانت هتتحمّل
 * كاملة على جهاز التلفزيون الضعيف. WebP بيحافظ على شفافية الشعارات.
 */
async function shrinkImage(file: Blob, edge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88))
  if (!blob) throw new Error('IMAGE_READ')
  return blob
}

export function useScreenAdmin() {
  const media = useBoardMedia()
  const announcements = useAnnouncements({ schedule: false })

  async function uploadMedia(file: File, kind: MediaFile['kind'], name: string) {
    if (file.size > MAX_AUDIO_BYTES) throw new Error('MAX_SIZE')
    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${kind === 'song' ? 'songs' : 'clips'}/${crypto.randomUUID()}.${ext}`
    const duration = await readDuration(file)

    const { error: upErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false })
    fail(upErr)

    const { error } = await supabase.rpc('lb_admin_register_media', {
      p_kind: kind,
      p_name: name.trim() || file.name,
      p_path: path,
      p_duration: duration,
      p_size: file.size,
    })
    if (error) {
      // السجل اترفض (حساب عرض مثلاً): ما نسيبش ملف يتيم في المخزن
      await supabase.storage.from(MEDIA_BUCKET).remove([path])
      throw new Error(error.message)
    }
    await media.reload()
  }

  async function deleteMedia(file: MediaFile) {
    const { data, error } = await supabase.rpc('lb_admin_delete_media', { p_id: file.id })
    fail(error)
    if (data) await supabase.storage.from(MEDIA_BUCKET).remove([data as string])
    await media.reload()
  }

  async function saveSettings(seconds: number, songId: string | null, volume: number) {
    const { error } = await supabase.rpc('lb_admin_save_board_settings', {
      p_seconds: seconds,
      p_song_id: songId,
      p_volume: volume,
    })
    fail(error)
    await media.reload()
  }

  async function saveCelebrationLang(lang: 'auto' | 'ar' | 'en') {
    const { error } = await supabase.rpc('lb_admin_set_celebration_lang', { p_lang: lang })
    fail(error)
    await media.reload()
  }

  async function saveAnnouncement(d: AnnouncementDraft) {
    const { data, error } = await supabase.rpc('lb_admin_save_announcement', {
      p_id: d.id,
      p_style: d.style,
      p_title: d.title,
      p_body: d.body,
      p_duration: d.duration_s,
      p_clip_id: d.clip_id,
      p_schedule: d.schedule,
      p_starts_at: d.starts_at,
      p_daily_time: d.schedule === 'daily' ? d.daily_time : null,
      p_weekdays: d.schedule === 'daily' ? d.weekdays : null,
      p_active: d.active,
      p_extra: { image_url: d.image_url, subtitle: d.subtitle, logos: d.logos },
    })
    fail(error)
    await announcements.reload()
    return data as string
  }

  /** يرفع صورة رسالة أو شعار ضيف ويرجّع رابطها العام. */
  /** @param ready صورة خارجة من استوديو الصورة: متصغّرة ومرمّزة خلاص. */
  async function uploadAnnouncementImage(file: Blob, kind: keyof typeof IMAGE_EDGE, ready = false) {
    if (!file.type.startsWith('image/')) throw new Error('IMAGE_TYPE')
    const blob = ready ? file : await shrinkImage(file, IMAGE_EDGE[kind])
    // Safari القديم ما بيكتبش WebP فبيرجّع PNG: الامتداد والنوع من الناتج الفعلي
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
    const path = `${kind}s/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(ANNOUNCE_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'image/png', upsert: false })
    fail(error)
    return supabase.storage.from(ANNOUNCE_BUCKET).getPublicUrl(path).data.publicUrl
  }

  async function deleteAnnouncement(id: string) {
    const { error } = await supabase.rpc('lb_admin_delete_announcement', { p_id: id })
    fail(error)
    await announcements.reload()
  }

  return { ...media, announcements, uploadMedia, deleteMedia, saveSettings, saveCelebrationLang, saveAnnouncement, deleteAnnouncement, uploadAnnouncementImage }
}
