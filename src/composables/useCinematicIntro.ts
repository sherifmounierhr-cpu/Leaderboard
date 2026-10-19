import { onBeforeUnmount, ref } from 'vue'
import { useAudioPlayer } from './useAudioPlayer'
import { useBoardMedia } from './useBoardMedia'

/** النغمة: ملف مولّد ثابت (public/sounds) فكل الشاشات تسمع نفس الصوت. الضربة عند 1.7ث. */
export const INTRO_URL = `${import.meta.env.BASE_URL}sounds/owner-intro.mp3`
const INTRO_SOUND_S = 5.2
/** طول الدخلة على الشاشة — بعده المحتوى نفسه. التوقيتات في CinematicIntro.vue مربوطة بالضربة. */
export const INTRO_MS = 4100

/**
 * توقيت الدخلة وصوتها: start() بيشغّل النغمة ويبدأ العدّ، وبعد INTRO_MS (أو
 * ضغطة تخطّي: finish(true)) الطور بيبقى 'main' وonMain بيتنادى مرة واحدة.
 * ذيل النغمة بيكمّل لوحده لو المحتوى ما فيهوش صوت.
 */
export function useCinematicIntro(onMain: (skipped: boolean) => void) {
  const { play, stop } = useAudioPlayer()
  const { settings } = useBoardMedia()
  const phase = ref<'intro' | 'main'>('main')
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel() {
    if (timer) clearTimeout(timer)
    timer = null
  }
  function start() {
    cancel()
    phase.value = 'intro'
    void play(INTRO_URL, settings.value.volume, INTRO_SOUND_S)
    timer = setTimeout(() => finish(false), INTRO_MS)
  }
  /** @param skipped ضغطة أثناء الدخلة: النغمة تقف والمحتوى يظهر على طول. */
  function finish(skipped: boolean) {
    if (phase.value !== 'intro') return
    cancel()
    if (skipped) stop()
    phase.value = 'main'
    onMain(skipped)
  }
  onBeforeUnmount(cancel)
  return { phase, start, finish, cancel }
}
