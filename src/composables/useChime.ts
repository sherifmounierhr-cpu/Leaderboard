import { settings } from './useSettings'
import { useBoardMedia } from './useBoardMedia'
import { useAudioPlayer } from './useAudioPlayer'

/**
 * تنبيه صوتي خفيف مع كل جديد على الشاشة: خبر عاجل أو حركة سعر.
 *
 * الافتراضي نغمة مولّدة بـ Web Audio مش ملف: مفيش تحميل ولا مساحة مخزن،
 * والصوت بيفضل هادي في مكتب — نغمتين بينهما خُمس ثانية مع خفوت ناعم.
 *
 * ولو المسؤول اختار ملف صوت من الإدارة، بيشتغل هو بدلها بمستوى الصوت المختار.
 * بيتقفل من الإدارة لكل الشاشات (news_chime)، أو من إعدادات الشاشة دي وحدها.
 */
/** أقصى مدة لملف التنبيه: تنبيه مش أغنية. */
const CLIP_MAX_S = 8

/** نغمتان صاعدتان: لا ثم مي أعلى — تنبيه بدون إزعاج. */
const NOTES = [880, 1174.66]
const NOTE_GAP_S = 0.18
const NOTE_LEN_S = 0.9
const PEAK = 0.12

let context: AudioContext | null = null

function ensureContext(): AudioContext | null {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    context = new Ctor()
    return context
  } catch {
    return null
  }
}

/**
 * يشغّل النغمة. بيرجع بهدوء لو الصوت مقفول من الإعدادات أو المتصفح لسه
 * مانع التشغيل — التنبيه الصوتي رفاهية، مش سبب لرسالة خطأ على الشاشة.
 */
export function chime() {
  const { settings: board, urlOf } = useBoardMedia()
  if (!settings.chime || board.value.news_chime === false) return

  // ملف مختار من الإدارة بيحل محل النغمة المولّدة
  const url = urlOf(board.value.news_sound_id ?? null)
  if (url) {
    void useAudioPlayer().play(url, board.value.news_volume ?? 70, CLIP_MAX_S)
    return
  }

  const ctx = ensureContext()
  if (!ctx) return
  // المتصفح بيبدأ الـ context موقوف لحد أول تفاعل
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  if (ctx.state !== 'running') return

  const gainScale = Math.min(1, Math.max(0, (board.value.news_volume ?? 70) / 100))
  NOTES.forEach((freq, i) => {
    const at = ctx.currentTime + i * NOTE_GAP_S
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    // موجة جيبية نقية: أقرب لجرس، بعيدة عن الطنين الحاد
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, PEAK * gainScale), at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LEN_S)
    osc.connect(gain).connect(ctx.destination)
    osc.start(at)
    osc.stop(at + NOTE_LEN_S + 0.05)
  })
}

/** تُستدعى من أول ضغطة على الشاشة، فالنغمة تشتغل بعدها من غير منع. */
export function unlockChime() {
  const ctx = ensureContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {})
}
