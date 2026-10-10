<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NUMBER_LOCALE } from '@/lib/region'
import { useI18n } from 'vue-i18n'
import { useMarkets } from '@/composables/useMarkets'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { advanceView } from '@/composables/useBoardControls'
import Sparkline from '@/components/Sparkline.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import StoryBar from '@/components/StoryBar.vue'
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
const TICK_MS = 250
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
const hasSpark = computed(() => (current.value?.spark.length ?? 0) > 2)

/** أعلى وأدنى إغلاق في الشهر — حدود خط الاتجاه بالأرقام. */
const range = computed(() => {
  const values = (current.value?.spark ?? []).filter((v) => Number.isFinite(v))
  if (values.length < 3) return null
  const digits = Math.max(...values) >= 1000 ? 0 : 2
  const fmt = (v: number) => n(v, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return { high: fmt(Math.max(...values)), low: fmt(Math.min(...values)) }
})

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
    const when = new Intl.DateTimeFormat(NUMBER_LOCALE.ar, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
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
    data-surface="dark"
    class="fixed inset-0 z-40 isolate flex flex-col overflow-hidden text-white"
    :class="!current
      ? 'bg-header'
      : isRate
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#1a4658_0%,#102a36_55%,#09161c_100%)]'
        : up
          ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#12615c_0%,#0c3231_55%,#0a1a1b_100%)]'
          : 'bg-[radial-gradient(120%_90%_at_50%_0%,#6b241f_0%,#361513_55%,#170b0a_100%)]'"
    :aria-label="ar('markets.label')"
  >
    <span class="peaks -z-10 !opacity-[0.035]" aria-hidden="true" />

    <p v-if="!current" class="m-auto text-white/60">{{ ar('markets.empty') }}</p>

    <template v-else>
      <!-- إطار الهوية: الشعار، سعر كام من كام، واسم الشاشة -->
      <header class="relative flex items-center gap-[clamp(14px,2.4vw,40px)] px-[5vw] pt-[clamp(16px,3.6vh,44px)]">
        <BrandLogo tone="white" class="h-[clamp(34px,6.4vh,72px)]" />
        <StoryBar
          class="flex-1"
          :count="slides.length"
          :index="index"
          :duration-ms="SLIDE_MS"
          :tone="isRate ? 'gold' : up ? 'up' : 'down'"
        />
        <span class="flex shrink-0 items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold text-[clamp(13px,2vh,24px)]">
          <iconify-icon icon="mdi:finance" aria-hidden="true" class="text-gold text-[1.25em]" />
          {{ ar('markets.label') }}
        </span>
      </header>

      <Transition name="quote" mode="out-in">
        <div
          :key="current.key"
          class="relative grid min-h-0 flex-1 items-center gap-[clamp(20px,4vw,72px)] px-[6vw] pb-[clamp(24px,6vh,80px)]"
          :class="hasSpark ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]' : 'justify-items-center text-center'"
        >
          <div class="flex min-w-0 flex-col gap-[clamp(10px,2.2vh,30px)]" :class="hasSpark ? 'items-start max-lg:items-center max-lg:text-center' : 'items-center'">
            <span class="rise flex items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold tracking-[0.04em] text-[clamp(13px,2vh,24px)]">
              <iconify-icon
                :icon="isRate ? 'mdi:bank-outline' : up ? 'mdi:trending-up' : 'mdi:trending-down'"
                aria-hidden="true"
                class="text-[1.3em]"
                :class="isRate ? 'text-gold' : up ? 'text-accent-live' : 'text-down'"
              />
              {{ isRate ? ar('markets.rateLabel') : ar(up ? 'markets.alert.up' : 'markets.alert.down') }}
              <span class="tabular-nums text-white/55">{{ index + 1 }}/{{ slides.length }}</span>
            </span>

            <h2 class="rise m-0 font-extrabold leading-[1.1] text-balance break-words text-[clamp(30px,6.5vh,86px)]" style="--i: 1">
              {{ ar(`markets.name.${current.key}`) }}
            </h2>

            <p class="rise m-0 flex items-baseline gap-[0.4em] font-extrabold tabular-nums leading-none text-[clamp(44px,11vh,150px)]" style="--i: 2">
              <span dir="ltr">{{ price }}</span>
              <span class="font-semibold text-white/60 text-[0.26em]">
                {{ current.currency
                }}<template v-if="current.unit"> / {{ ar(`markets.unit.${current.unit}`) }}</template>
              </span>
            </p>

            <p v-if="note" class="rise m-0 font-semibold text-white/65 text-[clamp(14px,2.4vh,30px)]" style="--i: 3">{{ note }}</p>

            <p
              v-if="!isRate"
              class="rise m-0 flex items-center gap-[0.35em] rounded-[0.5em] px-[0.5em] py-[0.15em] font-extrabold tabular-nums text-[clamp(24px,5vh,64px)]"
              :class="up ? 'bg-accent-live/15 text-accent-live' : 'bg-down/20 text-[#ff9d94]'"
              style="--i: 3"
            >
              <iconify-icon :icon="up ? 'mdi:arrow-up-bold' : 'mdi:arrow-down-bold'" aria-hidden="true" class="text-[0.8em]" />
              <!-- بدون عزل، علامة السالب بتتنقل لآخر النسبة في الاتجاه العربي -->
              <bdi dir="ltr">{{ move }}</bdi>
              <span class="ms-[0.3em] font-semibold text-white/60 text-[0.42em]">{{ ar('markets.sinceClose') }}</span>
            </p>
          </div>

          <!-- خط الشهر في لوحته: شكل الحركة وحدودها بالأرقام -->
          <div
            v-if="hasSpark"
            class="rise flex min-w-0 flex-col gap-[clamp(10px,2vh,24px)] rounded-[clamp(18px,3vh,36px)] border border-white/12 bg-white/[0.06] p-[clamp(16px,3.2vh,44px)]"
            style="--i: 2"
          >
            <div class="flex items-center justify-between gap-4 font-semibold text-white/65 text-[clamp(13px,2vh,24px)]">
              <span class="flex items-center gap-[0.5em]">
                <iconify-icon icon="mdi:chart-line" aria-hidden="true" class="text-[1.2em]" />
                {{ ar('markets.lastMonth') }}
              </span>
              <span v-if="range" class="flex gap-[1.2em] tabular-nums">
                <span>{{ ar('markets.high') }} <b class="text-white" dir="ltr">{{ range.high }}</b></span>
                <span>{{ ar('markets.low') }} <b class="text-white" dir="ltr">{{ range.low }}</b></span>
              </span>
            </div>
            <Sparkline :points="current.spark" :up="up" class="h-[clamp(110px,34vh,420px)] w-full" />
          </div>
        </div>
      </Transition>
    </template>
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
