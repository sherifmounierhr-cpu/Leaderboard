<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from './BrandLogo.vue'
import { useOwners } from '@/composables/useOwners'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useLocalName } from '@/composables/useLocalName'
import { drivePhotoUrl } from '@/lib/format'

/**
 * كلمة صاحب العمل بملء الشاشة: صورته في دايرة بإطار ذهبي (بتنبض وهو بيتكلم
 * لو الرسالة صوتية)، والمُوجَّه له — الكل، فريق، أو شخص بصورته — والكلمة
 * نفسها بخط كبير بين علامتي تنصيص. الطابور وأولويته في useOverlayQueue.
 */
const props = withDefaults(defineProps<{ previewOnly?: boolean }>(), { previewOnly: false })

const { t } = useI18n()
const localName = useLocalName()
const { current, dismiss } = useOwners({ board: !props.previewOnly })
const { settings } = useBoardMedia()
const { play, stop, playing } = useAudioPlayer()

const candidate = computed(() => {
  const c = current.value
  if (!c) return null
  if (props.previewOnly && !c.preview) return null
  return c
})
const active = props.previewOnly
  ? computed(() => true)
  : useOverlayLayer('owner', computed(() => candidate.value !== null))
const shown = computed(() => (active.value ? candidate.value : null))
const m = computed(() => shown.value?.message ?? null)

/** مدة العرض: الصوت كامل + لحظة، أو وقت قراءة النص — الأطول فيهم. */
function secondsFor(msg: NonNullable<typeof m.value>) {
  const reading = msg.body ? Math.min(45, Math.max(10, 6 + msg.body.length * 0.09)) : 0
  const voice = msg.audio_url && msg.audio_seconds ? msg.audio_seconds + 2.5 : msg.audio_url ? 30 : 0
  return Math.max(8, reading, voice)
}

const now = ref(Date.now())
const startedAt = ref(0)
const total = ref(0)
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 200) })
onBeforeUnmount(() => { if (clock) clearInterval(clock); stop() })

watch(
  () => shown.value?.key,
  (key) => {
    stop()
    const msg = m.value
    if (!key || !msg) return
    startedAt.value = Date.now()
    now.value = startedAt.value
    total.value = secondsFor(msg)
    if (msg.audio_url) void play(msg.audio_url, settings.value.volume, total.value)
  },
  { immediate: true },
)

const elapsed = computed(() => Math.max(0, (now.value - startedAt.value) / 1000))
const progress = computed(() => (total.value ? Math.min(100, (elapsed.value / total.value) * 100) : 0))
watch(() => Boolean(shown.value) && elapsed.value >= total.value && total.value > 0, (done) => { if (done) close() })

function close() {
  stop()
  dismiss()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) close()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

// ------------------------------------------------------------ المحتوى
const ownerName = computed(() => (m.value ? localName(m.value.owner_name || '', m.value.owner_name_ar) || t('owners.someone') : ''))
const ownerTitle = computed(() => (m.value ? localName(m.value.owner_title || '', m.value.owner_title_ar) : ''))
const ownerPhoto = computed(() => drivePhotoUrl(m.value?.owner_photo ?? null))

type Audience = { kind: 'all' } | { kind: 'team' | 'agent'; name: string; photo: string | null }
const audience = computed<Audience>(() => {
  const msg = m.value
  if (msg?.to_agent_id && msg.to_agent_name) {
    return { kind: 'agent', name: localName(msg.to_agent_name, msg.to_agent_name_ar), photo: drivePhotoUrl(msg.to_agent_photo) }
  }
  if (msg?.to_team_id && msg.to_team_name) {
    return { kind: 'team', name: localName(msg.to_team_name, msg.to_team_name_ar), photo: drivePhotoUrl(msg.to_team_photo) }
  }
  return { kind: 'all' }
})

/** الكلمة الطويلة بخط أصغر — عشان ما تعدّيش الشاشة، والقصيرة تبقى كبيرة. */
const bodySize = computed(() => {
  const n = m.value?.body?.length ?? 0
  if (n <= 70) return 'ow-body-xl'
  if (n <= 170) return 'ow-body-lg'
  if (n <= 300) return 'ow-body-md'
  return 'ow-body-sm'
})

const voiceTotal = computed(() => m.value?.audio_seconds ?? 0)
const voiceElapsed = computed(() => Math.min(voiceTotal.value || Infinity, elapsed.value))
function clockOf(sec: number) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* موجة الصوت: أعمدة بارتفاعات وتأخيرات ثابتة، بتتحرك وقت التشغيل بس */
const BARS = Array.from({ length: 32 }, (_, i) => ({
  h: 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
  d: `${(i % 7) * -0.13}s`,
  dur: `${0.7 + (i % 5) * 0.12}s`,
}))

const initials = computed(() =>
  ownerName.value.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join(''),
)

/* تاج من علامات حوالين الصورة: 72 علامة، كل سادسة أطول — بتلف ببطء */
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2
  const long = i % 6 === 0
  const r1 = long ? 45.2 : 45.8
  const r2 = 47.4
  return {
    x1: 50 + r1 * Math.sin(a), y1: 50 - r1 * Math.cos(a),
    x2: 50 + r2 * Math.sin(a), y2: 50 - r2 * Math.cos(a),
    long,
  }
})

const DUST = Array.from({ length: 14 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 9.17 + n * 41.3) * 43758.5453) % 1 + 1) % 1
  return { left: `${4 + r(1) * 92}%`, size: `${2 + r(2) * 3}px`, dur: `${12 + r(3) * 8}s`, delay: `${-r(4) * 18}s`, drift: `${(r(5) - 0.5) * 8}vw` }
})
</script>

<template>
  <Transition name="ow">
    <div
      v-if="shown && m"
      data-export-hide
      data-surface="dark"
      class="ow-root fixed inset-0 z-[59] flex cursor-pointer flex-col overflow-hidden text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="t('owners.overlayLabel', { name: ownerName })"
      @click="close"
    >
      <span aria-hidden="true" class="ow-beam" />
      <!-- شريط ضوء بيعدّي على الشاشة كلها مرة لحظة الظهور -->
      <span aria-hidden="true" class="ow-sweep" />
      <span aria-hidden="true" class="ow-quote-bg">”</span>
      <span
        v-for="(d, i) in DUST"
        :key="i"
        aria-hidden="true"
        class="ow-dust"
        :style="{ left: d.left, width: d.size, height: d.size, animationDuration: d.dur, animationDelay: d.delay, '--drift': d.drift }"
      />

      <BrandLogo tone="white" class="absolute top-[clamp(16px,3.6vh,44px)] end-[5vw] z-10 h-[clamp(30px,5.6vh,64px)]" />

      <div
        class="relative z-[1] m-auto grid w-full max-w-[min(94vw,110rem)] grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] items-center gap-[clamp(20px,4vw,90px)] px-[5vw] portrait:grid-cols-1 portrait:gap-[3vh] portrait:text-center"
      >
        <!-- صاحب الكلمة -->
        <div class="flex flex-col items-center gap-[clamp(12px,2.6vh,32px)] text-center">
          <div class="ow-portrait" :class="{ 'is-speaking': m.audio_url && playing }">
            <!-- أشعة ضوء بتلف ببطء ورا الصورة -->
            <span class="ow-rays" aria-hidden="true" />
            <span class="ow-halo" aria-hidden="true" />
            <span class="ow-pulse" aria-hidden="true" />
            <span class="ow-pulse ow-pulse-2" aria-hidden="true" />
            <span class="ow-pulse ow-pulse-3" aria-hidden="true" />
            <div class="ow-photo">
              <img v-if="ownerPhoto" :src="ownerPhoto" alt="" referrerpolicy="no-referrer" />
              <span v-else class="ow-initials" aria-hidden="true">{{ initials }}</span>
              <span class="ow-photo-sheen" aria-hidden="true" />
            </div>
            <!-- إطار ذهبي بيترسم حوالين الصورة، وتاج علامات بيلف حواليه -->
            <svg class="ow-frame" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="ow-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#fff3cf" />
                  <stop offset="45%" stop-color="#d9ad55" />
                  <stop offset="70%" stop-color="#8a6a1e" />
                  <stop offset="100%" stop-color="#f0d38a" />
                </linearGradient>
              </defs>
              <g class="ow-ticks">
                <line
                  v-for="(tk, i) in TICKS"
                  :key="i"
                  :x1="tk.x1" :y1="tk.y1" :x2="tk.x2" :y2="tk.y2"
                  :stroke-width="tk.long ? 0.45 : 0.22"
                  :opacity="tk.long ? 0.95 : 0.55"
                />
              </g>
              <circle class="ow-ring" cx="50" cy="50" r="44.2" pathLength="1" />
              <circle class="ow-ring ow-ring-outer" cx="50" cy="50" r="49" pathLength="1" />
            </svg>
            <!-- نجوم بتدور حوالين الصورة -->
            <span class="ow-orbit" aria-hidden="true"><i /><i /><i /></span>
            <span class="ow-orbit ow-orbit-2" aria-hidden="true"><i /><i /></span>
          </div>
          <div class="ow-rise flex flex-col items-center gap-[0.35em]" style="animation-delay: 420ms">
            <p dir="auto" class="ow-name m-0 font-extrabold leading-tight text-[clamp(26px,min(5.6vh,3.36vw),72px)]">{{ ownerName }}</p>
            <p v-if="ownerTitle" dir="auto" class="m-0 font-bold text-[#f0d38a] text-[clamp(15px,min(2.6vh,1.56vw),32px)]">{{ ownerTitle }}</p>
            <span class="ow-sign" aria-hidden="true" />
          </div>
        </div>

        <!-- الكلمة -->
        <div class="flex min-w-0 flex-col items-start gap-[clamp(14px,3vh,40px)] text-start portrait:items-center portrait:text-center">
          <div class="ow-rise flex flex-wrap items-center gap-[clamp(10px,1.2vw,22px)] portrait:justify-center" style="animation-delay: 300ms">
            <span class="ow-chip">
              <iconify-icon :icon="m.audio_url && !m.body ? 'mdi:microphone' : 'mdi:message-text-outline'" aria-hidden="true" class="text-[1.25em] text-[#f0d38a]" />
              {{ t('owners.wordFrom', { name: ownerName }) }}
            </span>
          </div>

          <!-- المُوجَّه له: الكل، فريق، أو شخص بصورته -->
          <div class="ow-rise ow-to" :class="audience.kind === 'agent' ? 'is-person' : ''" style="animation-delay: 480ms">
            <span class="ow-to-label">{{ t('owners.to') }}</span>
            <template v-if="audience.kind === 'all'">
              <span class="ow-to-icon" aria-hidden="true"><iconify-icon icon="mdi:account-group" /></span>
              <b>{{ t('owners.toAll') }}</b>
            </template>
            <template v-else>
              <span class="ow-to-photo" :class="audience.kind === 'team' ? 'is-team' : ''">
                <img v-if="audience.photo" :src="audience.photo" alt="" referrerpolicy="no-referrer" />
                <iconify-icon v-else :icon="audience.kind === 'team' ? 'mdi:account-group' : 'mdi:account'" aria-hidden="true" />
              </span>
              <b dir="auto">{{ audience.kind === 'team' ? t('owners.toTeam', { name: audience.name }) : audience.name }}</b>
            </template>
          </div>

          <blockquote v-if="m.body" dir="auto" class="ow-rise ow-body m-0" :class="bodySize" style="animation-delay: 650ms">
            <span class="ow-mark" aria-hidden="true">“</span>{{ m.body }}<span class="ow-mark ow-mark-end" aria-hidden="true">”</span>
          </blockquote>

          <!-- رسالة صوتية: موجة بتتحرك وقت التشغيل، ووقت مضى من الكل -->
          <div
            v-if="m.audio_url"
            class="ow-rise ow-voice"
            :class="[m.body ? '' : 'is-solo', playing ? 'is-playing' : '']"
            style="animation-delay: 800ms"
          >
            <span class="ow-voice-icon" aria-hidden="true"><iconify-icon icon="mdi:microphone" /></span>
            <span class="ow-wave" aria-hidden="true">
              <span
                v-for="(b, i) in BARS"
                :key="i"
                :style="{ '--h': b.h, animationDelay: b.d, animationDuration: b.dur }"
              />
            </span>
            <!-- ltr: «0:12 / 0:35» كانت بتتقلب في الصفحة العربية -->
            <span dir="ltr" class="ow-voice-time tabular-nums">
              {{ clockOf(voiceElapsed) }}<template v-if="voiceTotal"> / {{ clockOf(voiceTotal) }}</template>
            </span>
          </div>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 z-10 h-[clamp(4px,0.7vh,8px)] bg-[#f0d38a26]" aria-hidden="true">
        <div class="h-full bg-[linear-gradient(90deg,#f0d38a,#5ccfc3)] transition-[width] duration-200 ease-linear" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ow-root {
  background:
    radial-gradient(55% 70% at 22% 50%, #0f7e7655 0%, transparent 70%),
    radial-gradient(40% 50% at 85% 0%, #c9a45c26 0%, transparent 70%),
    linear-gradient(160deg, #0a2a2a 0%, #061617 55%, #030c0d 100%);
}
.ow-root:dir(rtl) {
  background:
    radial-gradient(55% 70% at 78% 50%, #0f7e7655 0%, transparent 70%),
    radial-gradient(40% 50% at 15% 0%, #c9a45c26 0%, transparent 70%),
    linear-gradient(200deg, #0a2a2a 0%, #061617 55%, #030c0d 100%);
}
/* علامة تنصيص عملاقة في الخلفية — توقيع الشاشة */
.ow-quote-bg {
  position: absolute;
  inset-inline-end: 4vw;
  top: -16vh;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 56vh;
  line-height: 1;
  color: #f0d38a;
  opacity: 0.05;
  pointer-events: none;
  animation: fade 1400ms ease 200ms backwards;
}
.ow-beam {
  position: absolute;
  top: -20vh;
  inset-inline-start: 12vw;
  width: 30vw;
  height: 150vh;
  pointer-events: none;
  background: linear-gradient(180deg, #f0dca826 0%, #f0dca80d 45%, transparent 80%);
  transform-origin: 50% 0;
  transform: rotate(12deg);
  animation: ow-sway 18s ease-in-out infinite alternate;
}
.ow-dust {
  position: absolute;
  bottom: -2vh;
  pointer-events: none;
  border-radius: 999px;
  background: #f0dca8;
  box-shadow: 0 0 6px 1px #f0dca880;
  opacity: 0;
  animation: ow-rise linear infinite;
}

/* ------------------------------------------------------------ الصورة */
.ow-portrait {
  position: relative;
  width: clamp(230px, min(64vh, 38vw), 760px);
  aspect-ratio: 1;
  animation: ow-portrait-in 1100ms cubic-bezier(0.2, 1.15, 0.3, 1) 100ms backwards;
}
@media (orientation: portrait) {
  .ow-portrait { width: min(68vw, 36vh); }
}
.ow-photo {
  position: absolute;
  inset: 6%;
  overflow: hidden;
  border-radius: 999px;
  background: linear-gradient(160deg, #1d5f59, #0a2627);
  box-shadow: 0 40px 90px -30px #000, inset 0 0 0 1px #f0d38a66;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ow-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.ow-initials { font-weight: 800; color: #f0d38a; font-size: clamp(40px, 9vh, 120px); }
/* لمعة بتعدّي على الصورة كل كام ثانية */
.ow-photo-sheen {
  position: absolute;
  inset: -10% auto -10% 0;
  width: 34%;
  background: linear-gradient(100deg, transparent, #ffffff59 50%, transparent);
  transform: translateX(-180%) skewX(-16deg);
  animation: ow-sheen 7s ease-in-out 1.8s infinite;
}
.ow-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ow-ticks {
  stroke: #f0d38a;
  stroke-linecap: round;
  transform-origin: 50px 50px;
  animation: ow-spin 90s linear infinite, fade 1200ms ease 600ms backwards;
}
.ow-ring {
  fill: none;
  stroke: url(#ow-gold);
  stroke-width: 1.1;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  transform: rotate(-90deg);
  transform-origin: 50px 50px;
  animation: ow-draw 1600ms cubic-bezier(0.65, 0, 0.35, 1) 250ms forwards;
}
.ow-ring-outer {
  stroke-width: 0.35;
  opacity: 0.7;
  animation-delay: 650ms;
  animation-duration: 2000ms;
}
/* أشعة: قرص مخروطي بيلف، باهت على الأطراف */
.ow-rays {
  position: absolute;
  inset: -34%;
  border-radius: 999px;
  background: repeating-conic-gradient(from 0deg, #f0d38a24 0deg 5deg, transparent 5deg 15deg);
  -webkit-mask: radial-gradient(closest-side, #000 30%, transparent 100%);
  mask: radial-gradient(closest-side, #000 30%, transparent 100%);
  animation: ow-spin 70s linear infinite reverse, fade 1500ms ease 300ms backwards;
}
.ow-halo {
  position: absolute;
  inset: -16%;
  border-radius: 999px;
  background: radial-gradient(closest-side, #f0d38a3d 0%, #0f7e7626 55%, transparent 75%);
}
/* نجوم بتدور: الحاوية بتلف، والنجوم ثابتة على محيطها */
.ow-orbit {
  position: absolute;
  inset: -5%;
  animation: ow-spin 16s linear infinite;
}
.ow-orbit-2 { inset: -11%; animation-duration: 26s; animation-direction: reverse; }
.ow-orbit i {
  position: absolute;
  width: clamp(10px, 1.8vh, 22px);
  aspect-ratio: 1;
  background: #fff4cf;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  filter: drop-shadow(0 0 5px #f0d38a);
  animation: ow-twinkle 2.4s ease-in-out infinite;
}
.ow-orbit i:nth-child(1) { top: -1%; left: 49%; }
.ow-orbit i:nth-child(2) { top: 72%; left: 92%; animation-delay: 0.8s; width: clamp(7px, 1.2vh, 15px); }
.ow-orbit i:nth-child(3) { top: 80%; left: 6%; animation-delay: 1.6s; }
.ow-orbit-2 i:nth-child(1) { top: 20%; left: 2%; animation-delay: 0.4s; width: clamp(6px, 1vh, 12px); }
.ow-orbit-2 i:nth-child(2) { top: 96%; left: 60%; animation-delay: 1.2s; width: clamp(8px, 1.4vh, 16px); }
/* الاسم بلمعة ذهبية بتمشي عليه */
.ow-name {
  background: linear-gradient(100deg, #ffffff 0%, #ffffff 38%, #f0d38a 48%, #fff6da 52%, #ffffff 62%, #ffffff 100%);
  background-size: 260% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: ow-shimmer 5.5s ease-in-out 1.2s infinite;
}
.ow-sweep {
  position: absolute;
  inset: -20% auto -20% 0;
  width: 22vw;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(100deg, transparent, #fff6da2e 50%, transparent);
  transform: translateX(-40vw) skewX(-14deg);
  animation: ow-sweep 1800ms cubic-bezier(0.45, 0, 0.2, 1) 350ms forwards;
}
/* موجات بتطلع من الصورة وهو بيتكلم */
.ow-pulse {
  position: absolute;
  inset: 6%;
  border-radius: 999px;
  border: 2px solid #f0d38a;
  opacity: 0;
}
.is-speaking .ow-pulse { animation: ow-pulse 2.4s ease-out infinite; }
.is-speaking .ow-pulse-2 { animation-delay: 0.8s; }
.is-speaking .ow-pulse-3 { animation-delay: 1.6s; }
.ow-sign {
  display: block;
  width: clamp(80px, 10vw, 220px);
  height: 2px;
  margin-top: 0.4em;
  background: linear-gradient(90deg, transparent, #f0d38a, transparent);
  animation: ow-grow 900ms var(--ease-out) 700ms backwards;
}

/* ------------------------------------------------------------ الكلمة */
.ow-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  border: 1px solid #f0d38a66;
  background: #f0d38a1a;
  border-radius: 999px;
  padding: 0.4em 1.2em;
  font-weight: 700;
  color: #fff7e2;
  font-size: clamp(15px, min(2.6vh, 1.56vw), 32px);
}
.ow-to {
  display: inline-flex;
  align-items: center;
  gap: 0.6em;
  font-size: clamp(18px, min(3.4vh, 2.04vw), 42px);
}
.ow-to b { font-weight: 800; color: #f0d38a; }
.ow-to-label { color: #ffffffb3; font-weight: 600; }
.ow-to-icon,
.ow-to-photo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8em;
  height: 1.8em;
  border-radius: 999px;
  overflow: hidden;
  background: #f0d38a1f;
  color: #f0d38a;
  box-shadow: 0 0 0 2px #f0d38a99;
}
.ow-to-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.ow-to-photo.is-team { border-radius: 0.45em; }
/* كلمة لشخص بعينه: صورته أكبر — هو بطل اللحظة */
.ow-to.is-person { font-size: clamp(22px, min(4.6vh, 2.76vw), 58px); }
.ow-to.is-person .ow-to-photo { width: 2.4em; height: 2.4em; box-shadow: 0 0 0 3px #f0d38a, 0 0 30px #f0d38a66; }

.ow-body {
  font-weight: 700;
  line-height: 1.45;
  text-wrap: pretty;
  overflow-wrap: anywhere;
  max-width: 36ch;
}
.ow-body-xl { font-size: clamp(28px, min(6.4vh, 3.84vw), 84px); line-height: 1.3; }
.ow-body-lg { font-size: clamp(24px, min(4.8vh, 2.88vw), 64px); }
.ow-body-md { font-size: clamp(20px, min(3.8vh, 2.28vw), 50px); max-width: 44ch; }
.ow-body-sm { font-size: clamp(18px, min(3vh, 1.8vw), 40px); max-width: 52ch; }
.ow-mark {
  font-family: Georgia, 'Times New Roman', serif;
  color: #f0d38a;
  font-size: 1.5em;
  line-height: 0;
  vertical-align: -0.3em;
  margin-inline-end: 0.12em;
}
.ow-mark-end { margin-inline: 0.12em 0; }

.ow-voice {
  display: flex;
  align-items: center;
  gap: clamp(10px, 1.2vw, 22px);
  padding: clamp(10px, 1.6vh, 20px) clamp(14px, 1.8vw, 30px);
  border-radius: 999px;
  background: #ffffff0f;
  box-shadow: inset 0 0 0 1px #f0d38a40;
  font-size: clamp(14px, min(2.4vh, 1.44vw), 30px);
}
.ow-voice.is-solo { font-size: clamp(18px, min(3.4vh, 2.04vw), 42px); }
.ow-voice-icon {
  display: inline-flex;
  width: 2em;
  height: 2em;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f0d38a;
  color: #0a2627;
  font-size: 1.1em;
}
.ow-wave {
  display: flex;
  align-items: center;
  gap: 0.18em;
  height: 2.2em;
}
.ow-wave span {
  width: 0.22em;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg, #fff3cf, #f0d38a);
  transform: scaleY(calc(var(--h) * 0.45));
  transform-origin: center;
}
.is-playing .ow-wave span { animation: ow-bar ease-in-out infinite alternate; }
.ow-voice-time { color: #ffffffcc; font-weight: 700; }

.ow-rise { animation: ow-up 800ms var(--ease-out) backwards; }

.ow-enter-active, .ow-leave-active { transition: opacity 0.5s ease; }
.ow-enter-from, .ow-leave-to { opacity: 0; }

@keyframes ow-portrait-in {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: none; }
}
@keyframes ow-up {
  from { opacity: 0; transform: translateY(2.4vh); }
  to { opacity: 1; transform: none; }
}
@keyframes ow-grow {
  from { opacity: 0; transform: scaleX(0); }
  to { opacity: 1; transform: none; }
}
@keyframes ow-spin { to { transform: rotate(1turn); } }
@keyframes ow-draw { to { stroke-dashoffset: 0; } }
@keyframes ow-sheen {
  0%, 60% { transform: translateX(-180%) skewX(-16deg); }
  100% { transform: translateX(420%) skewX(-16deg); }
}
@keyframes ow-twinkle {
  0%, 100% { opacity: 0.25; transform: scale(0.6); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes ow-shimmer {
  0% { background-position: 100% 0; }
  45%, 100% { background-position: 0% 0; }
}
@keyframes ow-sweep {
  from { opacity: 1; transform: translateX(-40vw) skewX(-14deg); }
  to { opacity: 1; transform: translateX(140vw) skewX(-14deg); }
}
@keyframes ow-pulse {
  from { opacity: 0.8; transform: scale(1); }
  to { opacity: 0; transform: scale(1.35); }
}
@keyframes ow-bar {
  from { transform: scaleY(calc(var(--h) * 0.25)); }
  to { transform: scaleY(var(--h)); }
}
@keyframes ow-sway {
  from { rotate: -4deg; }
  to { rotate: 5deg; }
}
@keyframes ow-rise {
  0% { opacity: 0; transform: translate(0, 0); }
  12% { opacity: 0.9; }
  80% { opacity: 0.5; }
  100% { opacity: 0; transform: translate(var(--drift), -96vh); }
}
@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .ow-beam, .is-speaking .ow-pulse, .is-playing .ow-wave span,
  .ow-ticks, .ow-rays, .ow-orbit, .ow-orbit i, .ow-photo-sheen, .ow-name { animation: none; }
  .ow-ring { animation: none; stroke-dashoffset: 0; }
  .ow-sweep { display: none; }
  .ow-dust { display: none; }
  .ow-rise, .ow-portrait, .ow-sign { animation: fade 200ms ease both; }
  .is-playing .ow-wave span { transform: scaleY(var(--h)); }
}
</style>
