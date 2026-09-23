<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarkets } from '@/composables/useMarkets'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { advanceView } from '@/composables/useBoardControls'
import Sparkline from '@/components/Sparkline.vue'
import type { MarketQuote } from '@/lib/types'

/**
 * نوبة الأسواق في التبديل التلقائي: قرار ورا قرار وسعر ورا سعر بملء الشاشة.
 *
 * الترتيب بيبدأ من اللي يهم المكتب: الدولار، وقرارات الفائدة (المركزي المصري
 * والفيدرالي الأمريكي)، وبعدها الأسعار اللي اتحرّكت — المصرية الأول. الأسعار
 * الساكنة مش بتتعرض؛ محدش بيقف قدام رقم ما اتغيرش.
 *
 * الشاشة دي عربية دايماً حتى لو اللوحة معروضة بالإنجليزية.
 */

/** مدة الشريحة الواحدة. */
const SLIDE_MS = 6_000
const TICK_MS = 100
/** تحت كده الحركة مش حركة — ضوضاء تداول. */
const MIN_PCT = 0.25
/** أسعار بتتعرض حتى لو ما اتحرّكتش، لأن المكتب بيسأل عنها كل يوم. */
const ALWAYS = ['usdegp']
/** سقف عدد الأسعار المتحرّكة في النوبة الواحدة. */
const MAX_MOVERS = 6
/** مهلة انتظار البيانات لو النوبة جت قبل ما توصل. */
const WAIT_MS = 6_000

const { t, n } = useI18n()
const { quotes } = useMarkets()
const { settings } = useBoardMedia()

/** نصوص الشاشة دي بالعربية دايماً، أياً كانت لغة اللوحة. */
const ar = (key: string) => t(key, {}, { locale: 'ar' })

const index = ref(0)
const startedAt = ref(Date.now())
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

/** قرارا المركزي المصري بيتدخّلوا من صفحة الإدارة، مش من الإنترنت. */
const cbeSlides = computed<MarketQuote[]>(() => {
  const s = settings.value
  const at = s.cbe_rates_at ?? undefined
  const rows: MarketQuote[] = []
  const add = (key: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return
    rows.push({
      key, symbol: key.toUpperCase(), group: 'rates', kind: 'rate', at,
      currency: '%', price: value, prev: value, changePct: 0, spark: [],
    })
  }
  add('cbe_deposit', s.cbe_deposit)
  add('cbe_lending', s.cbe_lending)
  return rows
})

const slides = computed<MarketQuote[]>(() => {
  const all = quotes.value
  const pinned = ALWAYS.map((key) => all.find((q) => q.key === key)).filter((q): q is MarketQuote => !!q)
  const rates = all.filter((q) => q.kind === 'rate')
  const movers = all
    .filter((q) => q.kind !== 'rate' && !ALWAYS.includes(q.key) && Math.abs(q.changePct) >= MIN_PCT)
    // المصري الأول، وبعده الأعنف حركة
    .sort((a, b) => {
      const egypt = Number(b.group === 'egypt') - Number(a.group === 'egypt')
      return egypt || Math.abs(b.changePct) - Math.abs(a.changePct)
    })
    .slice(0, MAX_MOVERS)
  return [...pinned, ...cbeSlides.value, ...rates, ...movers]
})

const current = computed(() => slides.value[index.value] ?? null)
const isRate = computed(() => current.value?.kind === 'rate')
const up = computed(() => (current.value?.changePct ?? 0) > 0)
const progress = computed(() => Math.min(100, ((now.value - startedAt.value) / SLIDE_MS) * 100))

const price = computed(() => {
  const quote = current.value
  if (!quote) return ''
  const digits = quote.kind === 'rate' ? 2 : quote.price >= 1000 ? 0 : quote.price >= 10 ? 2 : 3
  return n(quote.price, { minimumFractionDigits: digits, maximumFractionDigits: digits })
})

const move = computed(() => {
  const pct = current.value?.changePct ?? 0
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
})

/** سطر تحت الرقم: نطاق القرار الفيدرالي، أو تاريخ قرار المركزي المصري. */
const note = computed(() => {
  const quote = current.value
  if (!quote) return ''
  if (quote.band) {
    return `${ar('markets.band')} ${quote.band.map((v) => v.toFixed(2)).join(' – ')}%`
  }
  if (quote.at) {
    const date = new Date(quote.at)
    if (Number.isNaN(date.getTime())) return ''
    // nu-latn: باقي أرقام الشاشة لاتينية، والخلط بيبان غلط من بعيد
    const when = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
    return `${ar('markets.decidedOn')} ${when}`
  }
  return ''
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
  // البيانات ممكن تكون لسه في الطريق: نستنى شوية قبل ما نسلّم النوبة
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
      : isRate
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#1d3350_0%,#141f30_55%,#0b1119_100%)]'
        : up
          ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#18613f_0%,#0f2c1f_55%,#0a1712_100%)]'
          : 'bg-[radial-gradient(120%_90%_at_50%_0%,#6b241f_0%,#361513_55%,#170b0a_100%)]'"
    :aria-label="ar('markets.label')"
  >
    <p v-if="!current" class="m-0 text-white/60">{{ ar('markets.empty') }}</p>

    <Transition v-else name="quote" mode="out-in">
      <div :key="current.key" class="flex flex-col items-center gap-[clamp(10px,2.2vh,30px)]">
        <span class="flex items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(13px,2vh,24px)]">
          <iconify-icon
            :icon="isRate ? 'mdi:bank-outline' : up ? 'mdi:trending-up' : 'mdi:trending-down'"
            aria-hidden="true"
            class="text-[1.3em]"
            :class="isRate ? 'text-gold' : up ? 'text-accent-live' : 'text-down'"
          />
          {{ isRate ? ar('markets.rateLabel') : ar(up ? 'markets.alert.up' : 'markets.alert.down') }}
          <span class="text-white/50">{{ index + 1 }}/{{ slides.length }}</span>
        </span>

        <h2 class="m-0 font-extrabold leading-[1.1] text-balance break-words text-[clamp(30px,6.5vh,86px)]">
          {{ ar(`markets.name.${current.key}`) }}
        </h2>

        <p class="m-0 flex items-baseline justify-center gap-[0.4em] font-extrabold tabular-nums text-[clamp(40px,9vh,120px)] leading-none">
          <span dir="ltr">{{ price }}</span>
          <span class="font-semibold text-white/60 text-[0.3em]">
            {{ current.currency
            }}<template v-if="current.unit"> / {{ ar(`markets.unit.${current.unit}`) }}</template>
          </span>
        </p>

        <p v-if="note" class="m-0 font-semibold text-white/60 text-[clamp(14px,2.4vh,30px)]">{{ note }}</p>

        <p
          v-if="!isRate"
          class="m-0 font-extrabold tabular-nums text-[clamp(26px,5.5vh,70px)]"
          :class="up ? 'text-accent-live' : 'text-down'"
        >
          <!-- بدون عزل، علامة السالب بتتنقل لآخر النسبة في الاتجاه العربي -->
          <bdi dir="ltr">{{ move }}</bdi>
          <span class="ms-[0.4em] font-semibold text-white/50 text-[0.42em]">{{ ar('markets.sinceClose') }}</span>
        </p>

        <Sparkline
          v-if="current.spark.length > 2"
          :points="current.spark"
          :up="up"
          class="h-[clamp(40px,8vh,110px)] w-[min(70vw,40rem)] opacity-80"
        />
      </div>
    </Transition>

    <!-- الوقت الباقي للشريحة الحالية -->
    <div v-if="current" class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
      <div
        class="h-full transition-[width] duration-100 ease-linear"
        :class="isRate ? 'bg-gold' : up ? 'bg-accent-live' : 'bg-down'"
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
