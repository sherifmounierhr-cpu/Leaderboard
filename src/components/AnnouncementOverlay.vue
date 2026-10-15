<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from './BrandLogo.vue'
import { useAnnouncements } from '@/composables/useAnnouncements'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'

/**
 * رسائل الشاشة بملء الشاشة: ترحيب، تحفيز، ضيوف (مطوّرين بشعاراتهم)، وموظف
 * جديد. ترتيبها بين الشاشات التانية مكتوب في `useOverlayQueue`، مش هنا. وقت
 * الرسالة بيعدّي وهي مستنّية، فلو خلصت اللي قبلها بعد نهايتها ما تظهرش متأخرة.
 *
 * الضيوف والموظف الجديد ليهم سطح «فخم» ثابت (حبر غامق ونحاس) أياً كان مظهر
 * اللوحة: لحظة استقبال، مش جزء من الأرقام. الحركة كلها transform و opacity —
 * أشعة ضوء بطيئة، غبار نحاسي طالع، ولمعة بتعدّي على اللوحات — من غير blur.
 */
const props = withDefaults(defineProps<{ previewOnly?: boolean }>(), { previewOnly: false })

const { t } = useI18n()
const { current, dismiss } = useAnnouncements({ schedule: !props.previewOnly })
const { settings, urlOf } = useBoardMedia()
const { play, stop } = useAudioPlayer()

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 250) })
onBeforeUnmount(() => { if (clock) clearInterval(clock); stop() })

const candidate = computed(() => {
  const c = current.value
  if (!c) return null
  if (props.previewOnly && !c.preview) return null
  return c
})

/*
 * معاينة الإدارة ما بتدخلش الطابور: هي معروضة في صفحة الإدارة لوحدها،
 * وما يصحّش تزاحم شاشة حقيقية ولا تتأجّل بسببها.
 */
const active = props.previewOnly
  ? computed(() => true)
  : useOverlayLayer('announcement', computed(() => candidate.value !== null))

const shown = computed(() => (active.value ? candidate.value : null))
const a = computed(() => shown.value?.announcement ?? null)

const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => {
  const s = shown.value
  if (!s) return 0
  return Math.min(100, Math.max(0, 100 - (remaining.value / (s.announcement.duration_s * 1000)) * 100))
})

// شرط مركّب: رسالة خلص وقتها وهي مستنّية بترجع والباقي صفر من غير ما يتغيّر
watch(
  () => Boolean(shown.value) && remaining.value <= 0,
  (expired) => { if (expired) dismiss() },
)

// المقطع يبدأ مع ظهور الرسالة، ولمدة عرضها الباقية بس
watch(
  () => shown.value?.key,
  (key) => {
    stop()
    const s = shown.value
    if (!key || !s) return
    const url = urlOf(s.announcement.clip_id)
    if (url) void play(url, settings.value.volume, remaining.value / 1000)
  },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) close()
}
function close() {
  stop()
  dismiss()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const style = computed(() => a.value?.style ?? 'welcome')
/** سطح الحبر والنحاس: الضيوف والموظف الجديد. */
const luxe = computed(() => style.value === 'guests' || style.value === 'newhire')

/** صورة اتكسرت (اتمسحت من المخزن مثلاً): الرسالة تكمّل من غيرها. */
const broken = ref(new Set<string>())
watch(() => shown.value?.key, () => { broken.value = new Set() })
const image = computed(() => {
  const url = a.value?.image_url
  return url && !broken.value.has(url) ? url : null
})
const logos = computed(() => (a.value?.logos ?? []).filter((l) => l.url && !broken.value.has(l.url)))
function markBroken(url: string) {
  broken.value = new Set([...broken.value, url])
}

const CHIP_ICON: Record<string, string> = {
  welcome: 'mdi:hand-wave',
  motivation: 'mdi:rocket-launch',
  guests: 'mdi:handshake-outline',
  newhire: 'mdi:account-star-outline',
}

/*
 * غبار نحاسي: أماكن ثابتة محسوبة مرة واحدة (مش Math.random في كل رسم)، كل
 * ذرّة بمدّة وتأخير مختلفين فما يطلعوش صف واحد.
 */
const DUST = Array.from({ length: 16 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1
  return {
    left: `${4 + r(1) * 92}%`,
    size: `${2 + r(2) * 3.5}px`,
    dur: `${11 + r(3) * 9}s`,
    delay: `${-r(4) * 18}s`,
    drift: `${(r(5) - 0.5) * 8}vw`,
  }
})
</script>

<template>
  <Transition name="announce">
    <div
      v-if="shown && a"
      data-export-hide
      class="announce-root fixed inset-0 z-[58] flex cursor-pointer flex-col overflow-hidden"
      :class="[`is-${style}`, luxe ? 'is-luxe' : '']"
      :data-surface="luxe ? 'dark' : undefined"
      role="dialog"
      aria-modal="true"
      :aria-label="a.title"
      @click="close"
    >
      <!-- ============================ الجو ============================ -->
      <!-- بقع ضوء بتدرّج دائري ناعم بدل blur: نفس الشكل من غير فلتر تقيل على التلفزيون -->
      <span aria-hidden="true" class="announce-glow announce-halo pointer-events-none absolute -top-[30vh] -start-[16vw] size-[90vh] rounded-full" />
      <span aria-hidden="true" class="announce-glow announce-tint pointer-events-none absolute -bottom-[36vh] -end-[16vw] size-[100vh] rounded-full" />

      <template v-if="luxe">
        <!-- أشعة ضوء جاية من فوق زي إضاءة مدخل برج — بتتمايل ببطء -->
        <span aria-hidden="true" class="an-beam an-beam-1" />
        <span aria-hidden="true" class="an-beam an-beam-2" />
        <!-- خطوط معمارية رفيعة على الحواف: إطار لوبي، مش زخرفة عشوائية -->
        <span aria-hidden="true" class="an-frame" />
        <span
          v-for="(d, i) in DUST"
          :key="i"
          aria-hidden="true"
          class="an-dust"
          :style="{ left: d.left, width: d.size, height: d.size, animationDuration: d.dur, animationDelay: d.delay, '--drift': d.drift }"
        />
      </template>

      <BrandLogo
        :tone="luxe ? 'white' : 'auto'"
        class="absolute top-[clamp(16px,3.6vh,44px)] start-[5vw] z-10 h-[clamp(34px,6.4vh,72px)]"
      />

      <!-- ============================ ضيوف ============================ -->
      <div
        v-if="style === 'guests'"
        class="relative z-[1] m-auto flex w-full max-w-[min(92vw,96rem)] flex-col items-center gap-[clamp(14px,3.2vh,40px)] px-[5vw] text-center"
      >
        <div class="rise an-chip">
          <iconify-icon :icon="CHIP_ICON.guests" aria-hidden="true" class="an-accent text-[1.3em]" />
          {{ t('announce.chip_guests') }}
        </div>

        <!-- شعار واحد: لوحة إيفرست جنب لوحة الضيف. أكتر: صف لوحات الضيوف -->
        <div v-if="logos.length" class="flex flex-wrap items-center justify-center gap-[clamp(12px,2.4vw,40px)]">
          <template v-if="logos.length === 1">
            <figure class="an-plaque an-plaque-lg m-0" style="--i: 1">
              <BrandLogo tone="color" class="max-h-[62%] max-w-[78%]" />
            </figure>
            <span class="an-join" style="--i: 2" aria-hidden="true" />
          </template>
          <figure
            v-for="(logo, i) in logos"
            :key="logo.url"
            class="an-plaque m-0 flex-col"
            :class="logos.length === 1 ? 'an-plaque-lg' : logos.length <= 3 ? 'an-plaque-md' : 'an-plaque-sm'"
            :style="{ '--i': i + (logos.length === 1 ? 3 : 1) }"
          >
            <img
              :src="logo.url"
              :alt="logo.name || ''"
              class="max-h-[62%] max-w-[80%] object-contain"
              referrerpolicy="no-referrer"
              @error="markBroken(logo.url)"
            />
            <figcaption v-if="logo.name && logos.length > 1" class="an-plaque-name" dir="auto">{{ logo.name }}</figcaption>
          </figure>
        </div>

        <h2 dir="auto" class="rise an-title an-title-guests m-0" style="animation-delay: 380ms">{{ a.title }}</h2>
        <p v-if="a.subtitle" dir="auto" class="rise an-sub m-0" style="animation-delay: 480ms">
          <span class="an-rule" aria-hidden="true" />{{ a.subtitle }}<span class="an-rule" aria-hidden="true" />
        </p>
        <p v-if="a.body" dir="auto" class="rise an-body m-0 max-w-[58ch]" style="animation-delay: 580ms">{{ a.body }}</p>
      </div>

      <!-- ============================ موظف جديد ============================ -->
      <div
        v-else-if="style === 'newhire'"
        class="relative z-[1] m-auto grid w-full max-w-[min(94vw,104rem)] items-center gap-[clamp(20px,4.5vw,96px)] px-[6vw] portrait:grid-cols-1 portrait:justify-items-center portrait:text-center"
        :class="image ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1 justify-items-center text-center'"
      >
        <!-- باب مقوّس: بداية جديدة — الإطار بيترسم والصورة بتظهر جوّاه -->
        <figure v-if="image" class="an-arch m-0">
          <img :src="image" alt="" class="an-arch-photo" referrerpolicy="no-referrer" @error="markBroken(image)" />
          <!-- نفس نسبة الإطار (100×130) فالخط بيتمدّ بالتساوي من غير تشويه -->
          <svg class="an-arch-line" viewBox="0 0 100 130" aria-hidden="true">
            <path d="M1 129 V50 A49 49 0 0 1 99 50 V129" pathLength="1" />
          </svg>
          <svg class="an-arch-line an-arch-line-outer" viewBox="0 0 100 130" aria-hidden="true">
            <path d="M1 129 V50 A49 49 0 0 1 99 50 V129" pathLength="1" />
          </svg>
        </figure>

        <div
          class="flex min-w-0 flex-col gap-[clamp(10px,2.2vh,28px)]"
          :class="image ? 'items-start text-start portrait:items-center portrait:text-center' : 'items-center'"
        >
          <div class="rise an-chip" style="animation-delay: 500ms">
            <iconify-icon :icon="CHIP_ICON.newhire" aria-hidden="true" class="an-accent text-[1.3em]" />
            {{ t('announce.chip_newhire') }}
          </div>
          <h2 dir="auto" class="rise an-title an-title-name m-0" style="animation-delay: 620ms">{{ a.title }}</h2>
          <p v-if="a.subtitle" dir="auto" class="rise an-role m-0" style="animation-delay: 740ms">{{ a.subtitle }}</p>
          <span class="an-divider" aria-hidden="true" />
          <p v-if="a.body" dir="auto" class="rise an-body m-0 max-w-[46ch]" style="animation-delay: 900ms">{{ a.body }}</p>
          <p class="rise an-signoff m-0" style="animation-delay: 1020ms">{{ t('announce.newhireSignoff') }}</p>
        </div>
      </div>

      <!-- ============================ ترحيب وتحفيز ============================ -->
      <div
        v-else
        class="relative z-[1] m-auto grid w-full items-center gap-[clamp(20px,4vw,80px)] px-[6vw] portrait:grid-cols-1 portrait:justify-items-center portrait:text-center"
        :class="image ? 'max-w-[min(94vw,104rem)] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : 'max-w-[min(90vw,80rem)] grid-cols-1 justify-items-center text-center'"
      >
        <div class="flex min-w-0 flex-col gap-[clamp(16px,3.5vh,44px)]" :class="image ? 'items-start text-start portrait:items-center portrait:text-center' : 'items-center'">
          <div class="rise an-chip">
            <iconify-icon :icon="CHIP_ICON[style]" aria-hidden="true" class="an-accent text-[1.3em]" />
            {{ t(`announce.${style}`) }}
          </div>
          <h2 dir="auto" class="rise an-title m-0" :class="image ? 'an-title-split' : ''" style="animation-delay: 110ms">{{ a.title }}</h2>
          <p v-if="a.body" dir="auto" class="rise an-body m-0 max-w-[60ch]" style="animation-delay: 240ms">{{ a.body }}</p>
        </div>
        <figure v-if="image" class="an-photo m-0 portrait:order-first">
          <img :src="image" alt="" class="size-full object-cover" referrerpolicy="no-referrer" @error="markBroken(image)" />
        </figure>
      </div>

      <!-- الوقت الباقي -->
      <div class="announce-track absolute inset-x-0 bottom-0 z-10 h-[clamp(4px,0.7vh,8px)]" aria-hidden="true">
        <div class="announce-fill h-full transition-[width] duration-300 ease-linear" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/*
 * الألوان متغيّرات: الترحيب والتحفيز بيتبعوا مظهر اللوحة، والضيوف والموظف
 * الجديد ليهم سطح ثابت. القيم العشوائية جوّه class كانت هتطلع سلاسل مش بتتقرا.
 */
.announce-root {
  background-image: var(--an-bg);
  color: var(--announce-ink);
  --an-ink-soft: var(--announce-ink-soft);
  --an-chip: var(--announce-chip);
  --an-chip-line: var(--announce-chip-line);
  --an-title-shadow: var(--announce-title-shadow);
}
.announce-root.is-welcome {
  --an-bg: var(--announce-welcome);
  --an-accent: var(--announce-accent-welcome);
}
.announce-root.is-motivation {
  --an-bg: var(--announce-motivation);
  --an-accent: var(--announce-accent-motivation);
}
/* حبر غامق ونحاس: إضاءة مدخل برج بالليل */
.announce-root.is-luxe {
  --brass: #c9a45c;
  --brass-hi: #f0dca8;
  --champagne: #f6efdf;
  --an-accent: var(--brass-hi);
  --an-ink-soft: #f6efdfcc;
  --an-chip: #c9a45c1f;
  --an-chip-line: #c9a45c66;
  --an-title-shadow: #00000080;
  color: #ffffff;
  background-image:
    radial-gradient(70% 55% at 50% -8%, #0f7e7655 0%, transparent 70%),
    radial-gradient(60% 50% at 50% 115%, #c9a45c26 0%, transparent 70%),
    linear-gradient(180deg, #071c1d 0%, #061617 55%, #040f10 100%);
}
.announce-root.is-luxe .announce-halo { background: radial-gradient(closest-side, #0f7e7633, transparent); }
.announce-root.is-luxe .announce-tint { background: radial-gradient(closest-side, #c9a45c24, transparent); }

.announce-halo { background: radial-gradient(closest-side, var(--announce-halo), transparent); }
.announce-tint { background: radial-gradient(closest-side, color-mix(in srgb, var(--an-accent) 28%, transparent), transparent); }

/* ------------------------------------------------------------ النص */
.an-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  border: 1px solid var(--an-chip-line);
  background: var(--an-chip);
  border-radius: 999px;
  padding: 0.4em 1.1em;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: clamp(14px, min(2.3vh, 1.38vw), 28px);
}
.is-luxe .an-chip {
  color: var(--champagne);
  letter-spacing: 0.02em;
  font-size: clamp(16px, min(2.7vh, 1.62vw), 34px);
  padding: 0.45em 1.3em;
}
.an-accent { color: var(--an-accent); }

.an-title {
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-wrap: balance;
  overflow-wrap: anywhere;
  text-shadow: 0 4px 24px var(--an-title-shadow);
  font-size: clamp(40px, min(10vh, 6vw), 128px);
}
/* جنب صورة العمود نص الشاشة: نفس العنوان بالمقاس الكامل كان بينزل خمس سطور */
.an-title-split { font-size: clamp(34px, min(7.4vh, 4.44vw), 100px); }
.an-title-guests { font-size: clamp(34px, min(7.6vh, 4.56vw), 104px); }
.an-title-name { font-size: clamp(40px, min(11vh, 6.6vw), 150px); line-height: 1.02; }
.an-body {
  color: var(--an-ink-soft);
  font-weight: 500;
  line-height: 1.4;
  text-wrap: balance;
  overflow-wrap: anywhere;
  font-size: clamp(18px, min(3.6vh, 2.16vw), 46px);
}
.an-sub,
.an-role {
  color: var(--brass-hi);
  font-weight: 700;
  font-size: clamp(18px, min(3.4vh, 2.04vw), 42px);
}
.an-sub { display: inline-flex; align-items: center; gap: 0.7em; }
.an-rule {
  display: inline-block;
  width: clamp(24px, 4vw, 90px);
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--brass));
}
.an-rule:last-child { background: linear-gradient(90deg, var(--brass), transparent); }
.an-signoff {
  color: var(--brass);
  font-weight: 700;
  font-size: clamp(16px, min(2.8vh, 1.68vw), 34px);
  letter-spacing: 0.02em;
}
/* خط نحاسي بيتمد من بداية القراءة */
.an-divider {
  display: block;
  width: clamp(80px, 12vw, 260px);
  height: 2px;
  background: linear-gradient(90deg, var(--brass-hi), var(--brass) 60%, transparent);
  transform-origin: left center;
  animation: an-grow 900ms var(--ease-out) 820ms backwards;
}
:dir(rtl) .an-divider { transform-origin: right center; background: linear-gradient(270deg, var(--brass-hi), var(--brass) 60%, transparent); }
@media (orientation: portrait) {
  .an-divider { transform-origin: center; background: linear-gradient(90deg, transparent, var(--brass-hi), transparent); }
}

/* ------------------------------------------------------------ لوحات الشعارات */
.an-plaque {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  overflow: hidden;
  border-radius: clamp(14px, 1.6vh, 24px);
  background: linear-gradient(160deg, #fffdf8 0%, var(--champagne) 100%);
  box-shadow:
    0 0 0 1px #c9a45c8c,
    0 0 0 clamp(4px, 0.6vh, 8px) #c9a45c1a,
    0 30px 60px -24px #000000cc;
  animation: an-plaque-in 900ms var(--ease-out) backwards;
  animation-delay: calc(120ms + var(--i, 0) * 120ms);
}
.an-plaque-lg { width: clamp(180px, 24vw, 460px); aspect-ratio: 16 / 10; }
.an-plaque-md { width: clamp(150px, 20vw, 380px); aspect-ratio: 16 / 11; }
.an-plaque-sm { width: clamp(120px, 13vw, 260px); aspect-ratio: 16 / 12; }
.an-plaque-name {
  position: absolute;
  inset-inline: 0;
  bottom: 6%;
  color: #3b3220;
  font-weight: 700;
  font-size: clamp(11px, min(1.6vh, 0.96vw), 20px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-inline: 8%;
}
.an-plaque:has(.an-plaque-name) img { margin-bottom: 12%; }
/* لمعة بتعدّي على اللوحة كل كام ثانية — شريط مايل بيتحرك بـ transform */
.an-plaque::after {
  content: '';
  position: absolute;
  inset: -20% auto -20% 0;
  width: 38%;
  background: linear-gradient(100deg, transparent, #ffffffd9 50%, transparent);
  transform: translateX(-160%) skewX(-18deg);
  animation: an-sheen 6.5s ease-in-out infinite;
  animation-delay: calc(1.4s + var(--i, 0) * 0.35s);
}
/* وصلة بين لوحة إيفرست ولوحة الضيف: معيّن نحاسي بين خطين */
.an-join {
  position: relative;
  width: clamp(28px, 4vw, 80px);
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--brass), transparent);
  animation: an-grow 700ms var(--ease-out) 380ms backwards;
}
.an-join::after {
  content: '';
  position: absolute;
  inset-inline-start: 50%;
  top: 50%;
  width: clamp(8px, 1.1vh, 14px);
  aspect-ratio: 1;
  background: var(--brass-hi);
  transform: translate(-50%, -50%) rotate(45deg);
}

/* ------------------------------------------------------------ الباب المقوّس */
.an-arch {
  position: relative;
  width: clamp(200px, min(30vw, 54vh), 560px);
  aspect-ratio: 100 / 130;
}
/* جوّه الباب: ضوء دافي من تحت — صورة معزولة الخلفية بتقف فيه، والصورة العادية بتغطّيه */
.an-arch::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 999px 999px 0 0 / 38% 38% 0 0;
  background:
    radial-gradient(80% 45% at 50% 100%, #c9a45c59 0%, transparent 70%),
    linear-gradient(180deg, #0f4e49 0%, #0a2b2a 60%, #071c1d 100%);
  box-shadow: inset 0 0 0 1px #c9a45c40, 0 40px 80px -30px #000000e6;
  animation: fade 900ms ease 200ms backwards;
}
@media (orientation: portrait) {
  .an-arch { width: min(58vw, 34vh); }
}
.an-arch-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 22%;
  border-radius: 999px 999px 0 0 / 38% 38% 0 0;
  animation: an-photo-in 1400ms var(--ease-out) 350ms backwards;
}
.an-arch-line {
  position: absolute;
  inset: -3%;
  width: 106%;
  height: 106%;
  overflow: visible;
  fill: none;
  stroke: var(--brass-hi);
  stroke-width: 0.55;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: an-draw 1800ms var(--ease-out) 150ms forwards;
}
.an-arch-line-outer {
  inset: -7.5%;
  width: 115%;
  height: 115%;
  stroke: var(--brass);
  stroke-width: 0.3;
  opacity: 0.6;
  animation-delay: 450ms;
}

/* ------------------------------------------------------------ صورة الترحيب والتحفيز */
.an-photo {
  position: relative;
  width: 100%;
  max-height: 70vh;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: clamp(18px, 2.4vh, 32px);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--an-accent) 45%, transparent), 0 40px 80px -30px #0000008c;
  animation: an-photo-in 1200ms var(--ease-out) 200ms backwards;
}
@media (orientation: portrait) {
  .an-photo { max-height: 34vh; width: min(84vw, 52vh); }
}

/* ------------------------------------------------------------ الجو */
.an-beam {
  position: absolute;
  top: -20vh;
  width: 26vw;
  height: 150vh;
  pointer-events: none;
  background: linear-gradient(180deg, #f0dca82e 0%, #f0dca80f 45%, transparent 80%);
  transform-origin: 50% 0;
  animation: an-sway 16s ease-in-out infinite alternate;
}
.an-beam-1 { inset-inline-start: 14vw; transform: rotate(14deg); }
.an-beam-2 { inset-inline-end: 12vw; transform: rotate(-12deg); animation-duration: 21s; animation-delay: -7s; }
.an-frame {
  position: absolute;
  inset: clamp(14px, 2.6vh, 34px);
  pointer-events: none;
  border: 1px solid #c9a45c2e;
  border-radius: clamp(16px, 2.4vh, 30px);
}
.an-dust {
  position: absolute;
  bottom: -2vh;
  pointer-events: none;
  border-radius: 999px;
  background: var(--brass-hi);
  box-shadow: 0 0 6px 1px #f0dca880;
  opacity: 0;
  animation: an-rise linear infinite;
}

.announce-track { background: var(--announce-track); }
.is-luxe .announce-track { background: #c9a45c26; }
.announce-fill { background: var(--an-accent); }

.announce-enter-active,
.announce-leave-active {
  transition: opacity 0.5s ease;
}
.announce-enter-from,
.announce-leave-to {
  opacity: 0;
}
.announce-glow {
  animation: announce-glow 9s ease-in-out infinite alternate;
}

@keyframes announce-glow {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(4vw, 3vh) scale(1.12); }
}
@keyframes an-grow {
  from { transform: scaleX(0); opacity: 0; }
  to { transform: scaleX(1); opacity: 1; }
}
@keyframes an-plaque-in {
  from { opacity: 0; transform: translateY(4vh) scale(0.94); }
  to { opacity: 1; transform: none; }
}
@keyframes an-sheen {
  0%, 62% { transform: translateX(-160%) skewX(-18deg); }
  100% { transform: translateX(380%) skewX(-18deg); }
}
@keyframes an-photo-in {
  from { opacity: 0; transform: scale(1.06); }
  to { opacity: 1; transform: none; }
}
@keyframes an-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes an-sway {
  from { rotate: -4deg; }
  to { rotate: 5deg; }
}
@keyframes an-rise {
  0% { opacity: 0; transform: translate(0, 0); }
  12% { opacity: 0.9; }
  80% { opacity: 0.5; }
  100% { opacity: 0; transform: translate(var(--drift), -96vh); }
}

/*
 * تقليل الحركة متدرّج: الحركة الدائمة (أشعة، غبار، لمعة، بقع ضوء) بتقف،
 * والدخول بيبقى ظهور بسيط. الإطار المقوّس بيظهر مرسوم على طول.
 */
@media (prefers-reduced-motion: reduce) {
  .announce-glow,
  .an-beam,
  .an-plaque::after { animation: none; }
  .an-dust { display: none; }
  .an-plaque,
  .an-arch-photo,
  .an-photo,
  .an-divider,
  .an-join { animation: fade 200ms ease both; }
  .an-arch-line { animation: none; stroke-dashoffset: 0; }
}
@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
