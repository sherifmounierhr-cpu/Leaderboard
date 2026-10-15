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

/**
 * رسالة تحفيز بصورة: مسرح احتفالي — الصورة كبيرة في إطار ذهبي (أو الشخص
 * المعزول واقف بطول الشاشة)، وراها أشعة بتلف، وقصاصات ونجوم بتلمع.
 */
const spotlight = computed(() => style.value === 'motivation' && Boolean(image.value))

/**
 * الصورة معزولة (أركانها شفافة)؟ الشخص يقف كبير من غير إطار. قراءة أركان
 * نسخة 64px — لو المصدر ما بيسمحش بالقراءة بتتعامل كصورة عادية في إطار.
 */
const imageCutout = ref(false)
const imageRatio = ref(4 / 3)
watch(
  image,
  (url) => {
    imageCutout.value = false
    imageRatio.value = 4 / 3
    if (!url) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (image.value !== url) return
      imageRatio.value = (img.naturalWidth || 4) / (img.naturalHeight || 3)
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 64
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 64, 64)
        const d = ctx.getImageData(0, 0, 64, 64).data
        const a = (x: number, y: number) => d[(y * 64 + x) * 4 + 3]
        imageCutout.value = [a(0, 0), a(63, 0), a(0, 63), a(63, 63)].some((v) => v < 16)
      } catch {
        imageCutout.value = false
      }
    }
    img.src = url
  },
  { immediate: true },
)

/** إطار الصورة على قدّ نسبتها: عريضة تاخد عرض أكتر، طولية تاخد ارتفاع أكتر. */
const frameStyle = computed(() => {
  const r = Math.min(1.9, Math.max(0.62, imageRatio.value))
  return { '--r': String(r) }
})

/* قصاصات الاحتفال: نفس حركة شاشة الاحتفال (confetti) بألوان التحفيز الدافية */
const CONFETTI = ['#f0d38a', '#d9ad55', '#5ccfc3', '#ffffff', '#6cc45e']
const confetti = computed(() => {
  void shown.value?.key
  return Array.from({ length: 34 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    drift: `${(Math.random() - 0.5) * 24}vw`,
    delay: `${Math.random() * 3}s`,
    duration: `${3 + Math.random() * 2}s`,
    size: `clamp(${6 + Math.random() * 5}px, ${0.7 + Math.random() * 0.7}vw, ${12 + Math.random() * 10}px)`,
    color: CONFETTI[i % CONFETTI.length],
    radius: i % 3 === 0 ? '50%' : '2px',
  }))
})

/** نجوم بتلمع حوالين الصورة — أماكن ثابتة على حواف الإطار. */
const SPARKS = [
  { top: '4%', left: '8%', size: 1.1, delay: '0s' },
  { top: '12%', left: '94%', size: 0.8, delay: '0.7s' },
  { top: '46%', left: '-4%', size: 0.7, delay: '1.3s' },
  { top: '88%', left: '90%', size: 1, delay: '0.4s' },
  { top: '96%', left: '18%', size: 0.75, delay: '1.8s' },
  { top: '-5%', left: '58%', size: 0.9, delay: '2.3s' },
]

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
      :class="[`is-${style}`, luxe ? 'is-luxe' : '', spotlight ? 'is-spotlight' : '']"
      :data-surface="luxe || spotlight ? 'dark' : undefined"
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
        :tone="luxe || spotlight ? 'white' : 'auto'"
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

      <!-- ============================ تحفيز بصورة: مسرح احتفالي ============================ -->
      <template v-if="spotlight">
        <div data-confetti aria-hidden="true" class="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
          <span
            v-for="(p, i) in confetti"
            :key="i"
            class="absolute top-0 animate-confetti"
            :style="{
              left: p.left, width: p.size, height: p.size, background: p.color, borderRadius: p.radius,
              animationDelay: p.delay, animationDuration: p.duration, '--drift': p.drift,
            }"
          />
        </div>
      </template>
      <div
        v-if="spotlight && image"
        class="relative z-[1] m-auto grid w-full max-w-[min(96vw,112rem)] grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] items-center gap-[clamp(20px,3.5vw,72px)] px-[5vw] portrait:grid-cols-1 portrait:justify-items-center portrait:gap-[3vh] portrait:text-center"
      >
        <div class="flex min-w-0 flex-col items-start gap-[clamp(14px,3vh,40px)] text-start portrait:order-2 portrait:items-center portrait:text-center">
          <div class="rise an-chip sp-chip" style="animation-delay: 650ms">
            <iconify-icon icon="mdi:party-popper" aria-hidden="true" class="an-accent text-[1.3em]" />
            {{ t('announce.motivation') }}
          </div>
          <h2 dir="auto" class="rise an-title sp-title m-0" style="animation-delay: 780ms">{{ a.title }}</h2>
          <span class="sp-underline" aria-hidden="true" />
          <p v-if="a.body" dir="auto" class="rise an-body m-0 max-w-[40ch]" style="animation-delay: 1000ms">{{ a.body }}</p>
        </div>

        <div class="relative flex items-center justify-center portrait:order-1">
          <!-- أشعة شمس بتلف ببطء ورا الصورة + حلقة بتتمدّ مرة عند الظهور -->
          <span class="sp-rays" aria-hidden="true" />
          <span class="sp-burst" aria-hidden="true" />
          <span class="sp-glow" aria-hidden="true" />

          <figure v-if="imageCutout" class="sp-figure m-0">
            <img :src="image" alt="" referrerpolicy="no-referrer" @error="markBroken(image)" />
          </figure>
          <figure v-else class="sp-frame m-0" :style="frameStyle">
            <div class="sp-frame-inner">
              <img :src="image" alt="" class="sp-kenburns" referrerpolicy="no-referrer" @error="markBroken(image)" />
              <span class="sp-sheen" aria-hidden="true" />
            </div>
          </figure>

          <span
            v-for="(sp, i) in SPARKS"
            :key="i"
            class="sp-spark"
            aria-hidden="true"
            :style="{ top: sp.top, left: sp.left, '--s': sp.size, animationDelay: sp.delay }"
          />
        </div>
      </div>

      <!-- ============================ ترحيب وتحفيز ============================ -->
      <div
        v-else-if="!spotlight"
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

/* ------------------------------------------------------------ مسرح التحفيز */
.announce-root.is-spotlight {
  --gold: #f0d38a;
  --gold-deep: #c9a45c;
  --an-accent: var(--gold);
  --an-ink-soft: #ffffffd6;
  --an-chip: #f0d38a1f;
  --an-chip-line: #f0d38a66;
  --an-title-shadow: #00000099;
  color: #fff;
  background-image:
    radial-gradient(60% 70% at 72% 50%, #0f7e7666 0%, transparent 70%),
    radial-gradient(50% 50% at 15% 100%, #c9a45c33 0%, transparent 70%),
    linear-gradient(160deg, #0b2f2e 0%, #061617 60%, #040f10 100%);
}
.is-spotlight:dir(rtl) {
  background-image:
    radial-gradient(60% 70% at 28% 50%, #0f7e7666 0%, transparent 70%),
    radial-gradient(50% 50% at 85% 100%, #c9a45c33 0%, transparent 70%),
    linear-gradient(200deg, #0b2f2e 0%, #061617 60%, #040f10 100%);
}
.is-spotlight .announce-halo { background: radial-gradient(closest-side, #0f7e7640, transparent); }
.is-spotlight .announce-tint { background: radial-gradient(closest-side, #c9a45c33, transparent); }
.is-spotlight .announce-track { background: #f0d38a26; }
.sp-chip { color: #fff7e2; font-size: clamp(16px, min(2.7vh, 1.62vw), 34px); }
.sp-title { font-size: clamp(36px, min(9vh, 5.4vw), 124px); }
.sp-underline {
  display: block;
  width: clamp(90px, 14vw, 300px);
  height: clamp(4px, 0.6vh, 8px);
  border-radius: 999px;
  background: linear-gradient(90deg, var(--gold), #5ccfc3);
  transform-origin: left center;
  animation: an-grow 900ms var(--ease-out) 900ms backwards;
}
:dir(rtl) .sp-underline { transform-origin: right center; background: linear-gradient(270deg, var(--gold), #5ccfc3); }
@media (orientation: portrait) {
  .sp-underline { transform-origin: center; }
}

/* الإطار: حدّ ذهبي متدرّج (طبقة تحت الصورة)، ميلان خفيف وهو داخل */
.sp-frame {
  position: relative;
  z-index: 1;
  /* العرض من الارتفاع المسموح × نسبة الصورة: ما تعدّيش 76vh من غير تشويه */
  width: min(100%, calc(76vh * var(--r, 1.33)));
  aspect-ratio: var(--r, 1.33);
  padding: clamp(6px, 0.9vh, 12px);
  border-radius: clamp(20px, 3vh, 36px);
  background: linear-gradient(135deg, #fff1c9 0%, #d9ad55 30%, #8a6a1e 55%, #f0d38a 80%, #fff1c9 100%);
  box-shadow: 0 50px 120px -40px #000000f2, 0 0 0 1px #f0d38a55;
  animation: sp-frame-in 1100ms cubic-bezier(0.2, 1.2, 0.3, 1) 150ms backwards;
}
.sp-frame-inner {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: calc(clamp(20px, 3vh, 36px) - clamp(6px, 0.9vh, 12px));
}
.sp-kenburns {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform-origin: 60% 40%;
  animation: sp-kenburns 16s ease-in-out infinite alternate;
}
.sp-sheen {
  position: absolute;
  inset: -10% auto -10% 0;
  width: 30%;
  background: linear-gradient(100deg, transparent, #ffffff73 50%, transparent);
  transform: translateX(-160%) skewX(-16deg);
  animation: an-sheen 7s ease-in-out 1.6s infinite;
}
@media (orientation: portrait) {
  .sp-frame { width: min(88vw, calc(50vh * var(--r, 1.33))); }
}

/* الشخص المعزول: واقف بطول المسرح، طالع من تحت */
.sp-figure {
  position: relative;
  z-index: 1;
  height: min(84vh, 100%);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: sp-figure-in 1200ms var(--ease-out) 150ms backwards;
}
.sp-figure img {
  height: min(84vh, 62vw);
  width: auto;
  max-width: 100%;
  object-fit: contain;
  object-position: bottom;
}
@media (orientation: portrait) {
  .sp-figure img { height: min(52vh, 90vw); }
}

/* أشعة: قرص بتدرّج مخروطي بيلف — transform بس */
.sp-rays {
  position: absolute;
  z-index: 0;
  width: min(120vh, 120%);
  aspect-ratio: 1;
  border-radius: 999px;
  background: repeating-conic-gradient(from 0deg, #f0d38a2e 0deg 7deg, transparent 7deg 18deg);
  -webkit-mask: radial-gradient(closest-side, #000 20%, transparent 100%);
  mask: radial-gradient(closest-side, #000 20%, transparent 100%);
  animation: sp-rays 40s linear infinite, fade 1200ms ease 300ms backwards;
}
.sp-glow {
  position: absolute;
  z-index: 0;
  width: min(80vh, 90%);
  aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(closest-side, #f0d38a40, #0f7e7622 55%, transparent);
}
.sp-burst {
  position: absolute;
  z-index: 0;
  width: min(70vh, 80%);
  aspect-ratio: 1;
  border-radius: 999px;
  border: clamp(2px, 0.4vh, 5px) solid #f0d38a;
  opacity: 0;
  animation: sp-burst 1600ms var(--ease-out) 350ms;
}
/* نجمة رباعية بتلمع */
.sp-spark {
  position: absolute;
  z-index: 2;
  width: calc(clamp(18px, 3vh, 40px) * var(--s, 1));
  aspect-ratio: 1;
  background: #fff4cf;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  filter: drop-shadow(0 0 6px #f0d38a);
  opacity: 0;
  animation: sp-twinkle 2.6s ease-in-out infinite;
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
@keyframes sp-frame-in {
  from { opacity: 0; transform: scale(0.82) rotate(-4deg); }
  to { opacity: 1; transform: none; }
}
@keyframes sp-figure-in {
  from { opacity: 0; transform: translateY(12vh) scale(0.96); }
  to { opacity: 1; transform: none; }
}
@keyframes sp-kenburns {
  from { transform: scale(1); }
  to { transform: scale(1.1) translate(-1.5%, 1%); }
}
@keyframes sp-rays { to { transform: rotate(1turn); } }
@keyframes sp-burst {
  from { opacity: 0.9; transform: scale(0.4); }
  to { opacity: 0; transform: scale(1.7); }
}
@keyframes sp-twinkle {
  0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
  50% { opacity: 1; transform: scale(1) rotate(45deg); }
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
  .an-plaque::after,
  .sp-rays,
  .sp-kenburns,
  .sp-sheen { animation: none; }
  .sp-burst, .sp-spark { display: none; }
  .sp-frame, .sp-figure, .sp-underline { animation: fade 200ms ease both; }
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
