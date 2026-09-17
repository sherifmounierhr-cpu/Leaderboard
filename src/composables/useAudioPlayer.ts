import { ref } from 'vue'

/**
 * مشغّل صوت واحد للوحة كلها — احتفال ورسالة مايشتغلوش فوق بعض.
 *
 * المتصفحات بتمنع الصوت قبل أول ضغطة على الصفحة. لو المنع حصل، `blocked`
 * بتبقى true وزرار «تفعيل الصوت» بيظهر؛ أول ضغطة بتفك المنع وتكمّل آخر صوت
 * كان مطلوب. شاشة الكشك تتشغّل بـ --autoplay-policy=no-user-gesture-required.
 */

const FADE_MS = 1200

const blocked = ref(false)
const playing = ref(false)

let audio: HTMLAudioElement | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null
let fadeTimer: ReturnType<typeof setInterval> | null = null
/** آخر طلب اتمنع — يتشغّل لما المستخدم يفك المنع. */
let pending: { url: string; volume: number; seconds: number; startedAt: number } | null = null

function clearTimers() {
  if (stopTimer) clearTimeout(stopTimer)
  if (fadeTimer) clearInterval(fadeTimer)
  stopTimer = null
  fadeTimer = null
}

function stop() {
  clearTimers()
  pending = null
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  playing.value = false
}

/** يخفض الصوت تدريجياً ثم يقف — نهاية ناعمة بدل قطع مفاجئ. */
function fadeOut() {
  if (!audio) return stop()
  const el = audio
  const step = el.volume / (FADE_MS / 60)
  if (fadeTimer) clearInterval(fadeTimer)
  fadeTimer = setInterval(() => {
    el.volume = Math.max(0, el.volume - step)
    if (el.volume <= 0.01) stop()
  }, 60)
}

/**
 * @param volume 0..100
 * @param seconds مدة التشغيل القصوى؛ الصوت يخفت قبل نهايتها.
 */
async function play(url: string, volume: number, seconds: number) {
  stop()
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.addEventListener('ended', () => { clearTimers(); playing.value = false })
  }
  audio.src = url
  audio.volume = Math.min(1, Math.max(0, volume / 100))
  audio.currentTime = 0

  const startedAt = Date.now()
  try {
    await audio.play()
    blocked.value = false
    playing.value = true
    stopTimer = setTimeout(fadeOut, Math.max(0, seconds * 1000 - FADE_MS))
  } catch (err) {
    if ((err as DOMException)?.name === 'NotAllowedError') {
      blocked.value = true
      pending = { url, volume, seconds, startedAt }
    } else {
      console.warn('[audio]', err)
    }
  }
}

/** يُستدعى من ضغطة المستخدم: يفك المنع ويكمّل الصوت المعلّق للوقت الباقي. */
async function unlock() {
  const next = pending
  blocked.value = false
  if (!audio) audio = new Audio()
  if (next) {
    const left = next.seconds - (Date.now() - next.startedAt) / 1000
    if (left > 2) await play(next.url, next.volume, left)
    return
  }
  // تشغيل صامت قصير يسجّل «تفاعل» عند المتصفح للمرات الجاية
  try {
    audio.muted = true
    audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
    await audio.play()
  } catch { /* لا بأس */ } finally {
    audio.muted = false
  }
}

export function useAudioPlayer() {
  return { play, stop, unlock, blocked, playing }
}
