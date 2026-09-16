<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import { usePace } from '@/composables/usePace'

/**
 * «الصورة الكبيرة» للشركة في الربع المعروض: إجمالي مقابل المستهدف، الإيقاع،
 * الأيام المتبقية، والمطلوب يومياً للوصول للمستهدف.
 */
const { t } = useI18n()
const { teams } = useBoardData()
const { progress, expectedPct, statusOf } = usePace()

const totals = computed(() => {
  const deals = teams.value.reduce((s, x) => s + x.deals, 0)
  const target = teams.value.reduce((s, x) => s + x.target, 0)
  const pct = target > 0 ? Math.round((deals / target) * 100) : 0
  return { deals, target, pct }
})

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
  close: 'text-gold',
  behind: 'text-down',
} as const
</script>

<template>
  <section
    v-if="teams.length && totals.target > 0"
    :aria-label="t('kpi.label')"
    class="grid grid-cols-2 sm:grid-cols-4 rounded-xl border border-card-border bg-card shadow-[var(--shadow-card)] divide-card-border max-sm:[&>*:nth-child(odd)]:border-e max-sm:[&>*:nth-child(-n+2)]:border-b sm:divide-x sm:rtl:divide-x-reverse"
  >
    <!-- الإجمالي مقابل المستهدف -->
    <div class="flex flex-col justify-center gap-1 px-4 py-3 lg:px-6 lg:py-[clamp(6px,1vh,14px)] min-w-0">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.total') }}</span>
      <span class="flex items-baseline gap-2 min-w-0" :title="`${egp(totals.deals)} / ${egp(totals.target)}`">
        <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none">{{ compact(totals.deals) }}</b>
        <span class="font-medium tabular-nums text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] truncate">
          {{ t('kpi.of', { target: compact(totals.target) }) }}
        </span>
      </span>
    </div>

    <!-- نسبة الإنجاز والإيقاع -->
    <div class="flex flex-col justify-center gap-1 px-4 py-3 lg:px-6 lg:py-[clamp(6px,1vh,14px)] min-w-0">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.achieved') }}</span>
      <span class="flex items-baseline gap-2 min-w-0">
        <b class="font-bold tabular-nums text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none" :class="status ? TONE[status] : 'text-strong'">
          {{ totals.pct }}%
        </b>
        <span v-if="expectedPct !== null && progress.state === 'current'" class="font-semibold text-sm lg:text-[clamp(14px,1.7vh,19px)] truncate" :class="status ? TONE[status] : 'text-mute'">
          {{ gap >= 0 ? t('pace.aheadBy', { n: gap }) : t('pace.behindBy', { n: -gap }) }}
        </span>
      </span>
    </div>

    <!-- الأيام المتبقية -->
    <div class="flex flex-col justify-center gap-1 px-4 py-3 lg:px-6 lg:py-[clamp(6px,1vh,14px)] min-w-0">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.daysLeft') }}</span>
      <span class="flex items-baseline gap-2 min-w-0">
        <template v-if="progress.state === 'current'">
          <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none">{{ progress.daysLeft }}</b>
          <span class="font-medium text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] truncate">
            {{ t('kpi.ofDays', { n: progress.totalDays, elapsed: expectedPct }) }}
          </span>
        </template>
        <b v-else class="font-bold text-strong text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none">
          {{ progress.state === 'past' ? t('kpi.ended') : t('kpi.notStarted') }}
        </b>
      </span>
    </div>

    <!-- المطلوب يومياً -->
    <div class="flex flex-col justify-center gap-1 px-4 py-3 lg:px-6 lg:py-[clamp(6px,1vh,14px)] min-w-0">
      <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.35vh,15px)]">{{ t('kpi.perDay') }}</span>
      <span class="flex items-baseline gap-2 min-w-0">
        <template v-if="progress.state !== 'past' && perDay > 0">
          <b class="font-bold tabular-nums text-strong text-2xl lg:text-[clamp(22px,2.8vh,34px)] leading-none" :title="egp(perDay)">{{ compact(perDay) }}</b>
          <span class="font-medium text-mute text-sm lg:text-[clamp(14px,1.7vh,19px)] truncate">{{ t('kpi.perDayUnit') }}</span>
        </template>
        <b v-else-if="perDay === 0" class="font-bold text-accent-text text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none">{{ t('kpi.reached') }}</b>
        <b v-else class="font-bold text-down text-xl lg:text-[clamp(20px,2.6vh,30px)] leading-none" :title="egp(totals.target - totals.deals)">
          {{ t('kpi.shortBy', { amount: compact(totals.target - totals.deals) }) }}
        </b>
      </span>
    </div>
  </section>
</template>
