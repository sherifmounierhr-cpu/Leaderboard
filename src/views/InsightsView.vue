<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBoardData } from '@/composables/useBoardData'
import TrendChart from '@/components/charts/TrendChart.vue'
import QuarterCompare from '@/components/charts/QuarterCompare.vue'

const { history, quarterTotals, teams, calendarQuarter, loadHistory, loadQuarterTotals } =
  useBoardData()
const { t, locale } = useI18n()

// الشاشة تُفتح يدوياً، فنتأكد من وصول البيانات التاريخية عند أول عرض
onMounted(() => {
  if (!history.value.length) void loadHistory()
  if (!quarterTotals.value.length) void loadQuarterTotals()
})

const leaderId = computed(() => teams.value[0]?.id ?? '')

/**
 * اللقطات تخزّن الاسم الإنجليزي وقت الالتقاط، فنُترجم بالمعرّف.
 * quarterTotals يغطي كل الأرباع، فيشمل فروعاً قد لا تكون في الربع الحالي.
 */
const names = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const row of quarterTotals.value) {
    map[row.team_id] = row.name_ar && locale.value === 'ar' ? row.name_ar : row.name
  }
  for (const team of teams.value) map[team.id] = team.name
  return map
})

/** الأرباع التي بدأت فعلاً فقط. */
const quarters = computed(() =>
  Array.from({ length: calendarQuarter.value }, (_, i) => i + 1),
)
</script>

<template>
  <div data-scroll class="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-16 lg:py-11">
    <h2 class="sr-only">{{ t('header.insightsTitle') }}</h2>
    <div data-insights-grid class="grid gap-5 lg:gap-6 xl:grid-cols-2 items-start xl:items-stretch">
      <TrendChart :history="history" :leader-id="leaderId" :names="names" />
      <QuarterCompare :rows="quarterTotals" :quarters="quarters" />
    </div>
  </div>
</template>
