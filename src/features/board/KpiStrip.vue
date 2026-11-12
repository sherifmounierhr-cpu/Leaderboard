<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import { usePace } from '@/composables/usePace'
import { useCountUp } from '@/composables/useCountUp'

/**
 * «الصورة الكبيرة» للشركة في الربع المعروض: إجمالي مقابل المستهدف، الإيقاع،
 * الأيام المتبقية، والمطلوب يومياً للوصول للمستهدف.
 */
const { t } = useI18n()
const { teams, companyTotals } = useBoardData()
const { progress, expectedPct, statusOf } = usePace()

const totals = companyTotals

const shownDeals = useCountUp(computed(() => totals.value.deals))
const status = computed(() => statusOf(totals.value.pct))
const gap = computed(() => (expectedPct.value === null ? 0 : totals.value.pct - expectedPct.value))

const perDay = computed(() => {
  const remaining = totals.value.target - totals.value.deals
  // اليوم نفسه لسه فيه وقت، فالمتبقي = الأيام بعده + اليوم
  const days = progress.value.daysLeft + 1
  return remaining > 0 ? remaining / days : 0
})

const TONE = {
  ahead: 'text-accent-text',
  close: 'text-gold-text',
  behind: 'text-down',
} as const
</script>

<template>
  <section
    v-if="teams.length && totals.target > 0"
    :aria-label="t('kpi.label')"
    class="rise grid grid-cols-2 sm:grid-cols-4 rounded-2xl border border-card-border bg-card shadow-[var(--shadow-card)] divide-card-border max-sm:[&>*:nth-child(odd)]:border-e max-sm:[&>*:nth-child(-n+2)]:border-b sm:divide-x sm:rtl:divide-x-reverse"
  >
    <!-- الإجمالي مقابل المستهدف -->
    <div class="flex items-center gap-3 lg:gap-4 px-4 py-3 lg:px-6 lg:py-[clamp(8px,1.2vh,16px)] min-w-0">
      <span class="hidden sm:flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text size-10 lg:size-[clamp(38px,4.6vh,52px)] text-xl lg:text-[clamp(20px,2.5vh,28px)]" aria-hidden="true">
        <iconify-icon icon="mdi:cash-multiple" />
      </span>
      <div class="flex flex-col justify-center gap-1 min-w-0 flex-1">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.total') }}</span>
      <span class="flex items-baseline gap-2 min-w-0 max-sm:flex-wrap max-sm:gap-y-0.5" :title="`${egp(totals.deals)} / ${egp(totals.target)}`">
        <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none">{{ compact(shownDeals) }}</b>
        <span class="font-medium tabular-nums text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] sm:truncate">
          {{ t('kpi.of', { target: compact(totals.target) }) }}
        </span>
      </span>
      </div>
    </div>

    <!-- نسبة الإنجاز والإيقاع -->
    <div class="flex items-center gap-3 lg:gap-4 px-4 py-3 lg:px-6 lg:py-[clamp(8px,1.2vh,16px)] min-w-0">
      <span class="hidden sm:flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text size-10 lg:size-[clamp(38px,4.6vh,52px)] text-xl lg:text-[clamp(20px,2.5vh,28px)]" aria-hidden="true">
        <iconify-icon icon="mdi:target" />
      </span>
      <div class="flex flex-col justify-center gap-1 min-w-0 flex-1">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.achieved') }}</span>
      <span class="flex items-baseline gap-2 min-w-0 max-sm:flex-wrap max-sm:gap-y-0.5">
        <b class="font-bold tabular-nums text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none" :class="status ? TONE[status] : 'text-strong'">
          {{ totals.pct }}%
        </b>
        <span v-if="expectedPct !== null && progress.state === 'current'" class="font-semibold text-sm lg:text-[clamp(14px,1.7vh,19px)] sm:truncate" :class="status ? TONE[status] : 'text-mute'">
          {{ gap >= 0 ? t('pace.aheadBy', { n: gap }) : t('pace.behindBy', { n: -gap }) }}
        </span>
      </span>
      </div>
    </div>

    <!-- الأيام المتبقية -->
    <div class="flex items-center gap-3 lg:gap-4 px-4 py-3 lg:px-6 lg:py-[clamp(8px,1.2vh,16px)] min-w-0">
      <span class="hidden sm:flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text size-10 lg:size-[clamp(38px,4.6vh,52px)] text-xl lg:text-[clamp(20px,2.5vh,28px)]" aria-hidden="true">
        <iconify-icon icon="mdi:calendar-clock-outline" />
      </span>
      <div class="flex flex-col justify-center gap-1 min-w-0 flex-1">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.daysLeft') }}</span>
      <span class="flex items-baseline gap-2 min-w-0 max-sm:flex-wrap max-sm:gap-y-0.5">
        <template v-if="progress.state === 'current'">
          <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none">{{ progress.daysLeft }}</b>
          <span class="font-medium text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] sm:truncate">
            {{ t('kpi.ofDays', { n: progress.totalDays, elapsed: expectedPct }) }}
          </span>
        </template>
        <b v-else class="font-bold text-strong text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none">
          {{ progress.state === 'past' ? t('kpi.ended') : t('kpi.notStarted') }}
        </b>
      </span>
      </div>
    </div>

    <!-- المطلوب يومياً -->
    <div class="flex items-center gap-3 lg:gap-4 px-4 py-3 lg:px-6 lg:py-[clamp(8px,1.2vh,16px)] min-w-0">
      <span class="hidden sm:flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text size-10 lg:size-[clamp(38px,4.6vh,52px)] text-xl lg:text-[clamp(20px,2.5vh,28px)]" aria-hidden="true">
        <iconify-icon icon="mdi:speedometer" />
      </span>
      <div class="flex flex-col justify-center gap-1 min-w-0 flex-1">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.perDay') }}</span>
      <span class="flex items-baseline gap-2 min-w-0 max-sm:flex-wrap max-sm:gap-y-0.5">
        <template v-if="progress.state !== 'past' && perDay > 0">
          <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none" :title="egp(perDay)">{{ compact(perDay) }}</b>
          <span class="font-medium text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] sm:truncate">{{ t('kpi.perDayUnit') }}</span>
        </template>
        <b v-else-if="perDay === 0" class="font-bold text-accent-text text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none">{{ t('kpi.reached') }}</b>
        <b v-else class="font-bold text-down text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none" :title="egp(totals.target - totals.deals)">
          {{ t('kpi.shortBy', { amount: compact(totals.target - totals.deals) }) }}
        </b>
      </span>
      </div>
    </div>
  </section>
</template>
