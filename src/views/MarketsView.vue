<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarkets } from '@/composables/useMarkets'
import { advanceView } from '@/composables/useBoardControls'
import Sparkline from '@/components/Sparkline.vue'

/**
 * نوبة الأسواق في التبديل التلقائي: الأسعار اللي اتحرّكت بس، واحد ورا التاني
 * بملء الشاشة. الأسعار الساكنة مش بتتعرض — محدش بيقف قدام رقم ما اتغيرش.
 *
 * مفيش جدول ومفيش عرض اتنين مع بعض: رقم واحد كبير بلون حركته.
 */

/** مدة السعر الواحد على الشاشة. */
const SLIDE_MS = 6_000
const TICK_MS = 100
/** تحت كده الحركة مش حركة — ضوضاء تداول. */
const MIN_PCT = 0.25
/** سقف عدد الأسعار في النوبة الواحدة، عشان متطوّلش على الشاشة. */
const MAX_SLIDES = 8
/** مهلة انتظار الأسعار لو النوبة جت قبل ما توصل. */
const WAIT_MS = 6_000

const { t, n, locale } = useI18n()
const { quotes } = useMarkets()

const index = ref(0)
const startedAt = ref(Date.now())
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

const slides = computed(() =>
  [...quotes.value]
    .filter((q) => Math.abs(q.changePct) >= MIN_PCT)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, MAX_SLIDES),
)

const current = computed(() => slides.value[index.value] ?? null)
const up = computed(() => (current.value?.changePct ?? 0) > 0)
const progress = computed(() => Math.min(100, ((now.value - startedAt.value) / SLIDE_MS) * 100))

const price = computed(() => {
  void locale.value
  const quote = current.value
  if (!quote) return ''
  const digits = quote.price >= 1000 ? 0 : quote.price >= 10 ? 2 : 3
  return n(quote.price, { minimumFractionDigits: digits, maximumFractionDigits: digits })
})

const move = computed(() => {
  const pct = current.value?.changePct ?? 0
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
})

function show(at: number) {
  index.value = at
  startedAt.value = Date.now()
  now.value = startedAt.value
}

let done = false
function finish() {
  if (done) return
  done = true
  advanceView()
}

function step() {
  now.value = Date.now()
  // الأسعار ممكن تكون لسه في الطريق: نستنى شوية قبل ما نسلّم النوبة
  if (!slides.value.length) {
    if (now.value - mountedAt >= WAIT_MS) finish()
    return
  }
  if (now.value - startedAt.value < SLIDE_MS) return
  if (index.value + 1 < slides.value.length) show(index.value + 1)
  else finish()
}

const mountedAt = Date.now()

onMounted(() => {
  show(0)
  clock = setInterval(step, TICK_MS)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
})

watch(slides, (list, before) => {
  if (index.value >= list.length || !before?.length) show(0)
})
</script>

<template>
  <section
    dir="rtl"
    data-export-hide
    class="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[clamp(10px,2.2vh,30px)] overflow-hidden px-[6vw] text-center text-white"
    :class="!current
      ? 'bg-header'
      : up
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#18613f_0%,#0f2c1f_55%,#0a1712_100%)]'
        : 'bg-[radial-gradient(120%_90%_at_50%_0%,#6b241f_0%,#361513_55%,#170b0a_100%)]'"
    :aria-label="t('markets.label')"
  >
    <p v-if="!current" class="m-0 text-white/60">{{ t('markets.empty') }}</p>

    <Transition v-else name="quote" mode="out-in">
      <div :key="current.key" class="flex flex-col items-center gap-[clamp(10px,2.2vh,30px)]">
        <span class="flex items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(13px,2vh,24px)]">
          <iconify-icon
            :icon="up ? 'mdi:trending-up' : 'mdi:trending-down'"
            aria-hidden="true"
            class="text-[1.3em]"
            :class="up ? 'text-accent-live' : 'text-down'"
          />
          {{ t(up ? 'markets.alert.up' : 'markets.alert.down') }}
          <span class="text-white/50">{{ index + 1 }}/{{ slides.length }}</span>
        </span>

        <h2 class="m-0 font-extrabold leading-[1.1] text-balance break-words text-[clamp(30px,6.5vh,86px)]">
          {{ t(`markets.name.${current.key}`) }}
        </h2>

        <p class="m-0 flex items-baseline justify-center gap-[0.4em] font-extrabold tabular-nums text-[clamp(40px,9vh,120px)] leading-none">
          {{ price }}
          <span class="font-semibold text-white/60 text-[0.3em]">
            {{ current.currency }}<template v-if="current.unit"> / {{ t(`markets.unit.${current.unit}`) }}</template>
          </span>
        </p>

        <p
          class="m-0 font-extrabold tabular-nums text-[clamp(26px,5.5vh,70px)]"
          :class="up ? 'text-accent-live' : 'text-down'"
        >
          <!-- بدون عزل، علامة السالب بتتنقل لآخر النسبة في الاتجاه العربي -->
          <bdi dir="ltr">{{ move }}</bdi>
          <span class="ms-[0.4em] font-semibold text-white/50 text-[0.42em]">{{ t('markets.sinceClose') }}</span>
        </p>

        <Sparkline
          v-if="current.spark.length > 2"
          :points="current.spark"
          :up="up"
          class="h-[clamp(40px,8vh,110px)] w-[min(70vw,40rem)] opacity-80"
        />
      </div>
    </Transition>

    <!-- الوقت الباقي للسعر الحالي -->
    <div v-if="current" class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
      <div
        class="h-full transition-[width] duration-100 ease-linear"
        :class="up ? 'bg-accent-live' : 'bg-down'"
        :style="{ width: `${progress}%` }"
      />
    </div>
  </section>
</template>

<style scoped>
.quote-enter-active,
.quote-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.quote-enter-from { opacity: 0; transform: translateY(14px); }
.quote-leave-to { opacity: 0; transform: translateY(-14px); }

@media (prefers-reduced-motion: reduce) {
  .quote-enter-active,
  .quote-leave-active { transition: none; }
}
</style>
