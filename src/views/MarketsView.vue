<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { useMarkets } from '@/composables/useMarkets'
import Sparkline from '@/components/Sparkline.vue'
import type { MarketQuote } from '@/lib/types'

/**
 * شاشة الأسواق: الذهب والمعادن، ومصر (الدولار والبورصة وأسهم التطوير
 * العقاري)، والعقارات عالمياً. كل مجموعة ليها سطر قراءة سريع للاتجاه.
 */

const CLOCK_MS = 30_000
/** فوق كده المجموعة تتقرا «صاعدة» أو «هابطة»، وتحتها «مستقرة». */
const TREND_PCT = 0.3

const GROUPS = ['metals', 'egypt', 'global'] as const

const { t, locale, n } = useI18n()
const { quotes, fetchedAt, hasQuotes } = useMarkets()

const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = new Date() }, CLOCK_MS) })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })

/** خانتان للأسعار الصغيرة وصفر للأرقام الكبيرة — التفاصيل بتضيع من بعيد. */
function price(quote: MarketQuote) {
  void locale.value
  const digits = quote.price >= 1000 ? 0 : quote.price >= 10 ? 2 : 3
  return n(quote.price, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const groups = computed(() =>
  GROUPS.map((group) => {
    const rows = quotes.value.filter((q) => q.group === group)
    const avg = rows.length ? rows.reduce((sum, q) => sum + q.changePct, 0) / rows.length : 0
    const trend = avg > TREND_PCT ? 'up' : avg < -TREND_PCT ? 'down' : 'flat'
    return { group, rows, avg, trend }
  }).filter((g) => g.rows.length),
)

const updated = computed(() => {
  void locale.value
  return fetchedAt.value ? relativeTime(fetchedAt.value, now.value) : ''
})

const tone = (pct: number) => (pct > 0 ? 'text-accent-text' : pct < 0 ? 'text-down' : 'text-mute')
const arrow = (pct: number) => (pct > 0 ? 'mdi:trending-up' : pct < 0 ? 'mdi:trending-down' : 'mdi:trending-neutral')
const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
</script>

<template>
  <section class="flex-1 flex flex-col min-h-0 gap-3 px-4 py-6 sm:px-8 lg:px-16 lg:pt-[clamp(12px,2.2vh,28px)] lg:pb-[clamp(14px,2.6vh,32px)]">
    <header class="flex shrink-0 items-center justify-between gap-3">
      <h2 class="m-0 flex items-center gap-2 font-semibold text-strong text-lg lg:text-[clamp(17px,2.4vh,26px)]">
        <iconify-icon icon="mdi:chart-line" aria-hidden="true" class="text-gold" />
        {{ t('markets.label') }}
      </h2>
      <p v-if="updated" class="m-0 text-mute text-caption lg:text-note">{{ t('news.updated', { when: updated }) }}</p>
    </header>

    <p
      v-if="!hasQuotes"
      class="m-0 flex flex-1 items-center justify-center rounded-xl border border-dashed border-card-border text-mute"
    >{{ t('markets.empty') }}</p>

    <div v-else class="grid flex-1 min-h-0 gap-3 lg:gap-4 xl:grid-cols-3">
      <section
        v-for="g in groups"
        :key="g.group"
        class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-[var(--shadow-panel)]"
      >
        <header class="flex shrink-0 items-baseline justify-between gap-2 border-b border-divider px-4 py-2.5">
          <h3 class="m-0 font-semibold text-strong text-sm lg:text-[clamp(14px,1.9vh,19px)]">
            {{ t(`markets.group.${g.group}`) }}
          </h3>
          <span class="flex items-center gap-1 font-semibold text-caption lg:text-note" :class="tone(g.avg)">
            <iconify-icon :icon="arrow(g.avg)" aria-hidden="true" />
            {{ t(`markets.trend.${g.trend}`) }}
          </span>
        </header>

        <ul class="m-0 flex min-h-0 flex-1 list-none flex-col p-0">
          <li
            v-for="q in g.rows"
            :key="q.key"
            class="flex flex-1 items-center gap-3 border-b border-divider px-4 py-1.5 last:border-b-0 [@media(max-height:820px)]:py-1"
          >
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-semibold text-strong text-sm lg:text-[clamp(13px,1.75vh,18px)]">
                {{ t(`markets.name.${q.key}`) }}
              </span>
              <span class="truncate text-dim text-caption">
                {{ q.currency }}<template v-if="q.unit"> / {{ t(`markets.unit.${q.unit}`) }}</template>
              </span>
            </span>

            <Sparkline
              v-if="q.spark.length > 2"
              :points="q.spark"
              :up="q.changePct >= 0"
              class="hidden shrink-0 sm:block h-[clamp(20px,2.8vh,34px)] w-[clamp(52px,5vw,86px)]"
            />

            <span class="flex shrink-0 flex-col items-end">
              <span dir="ltr" class="font-bold tabular-nums text-strong text-sm lg:text-[clamp(15px,2.1vh,22px)]">
                {{ price(q) }}
              </span>
              <span dir="ltr" class="flex items-center gap-0.5 font-semibold tabular-nums text-caption lg:text-note" :class="tone(q.changePct)">
                <iconify-icon :icon="arrow(q.changePct)" aria-hidden="true" />
                {{ signed(q.changePct) }}
              </span>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <p class="m-0 shrink-0 text-dim text-caption">{{ t('markets.note') }}</p>
  </section>
</template>
