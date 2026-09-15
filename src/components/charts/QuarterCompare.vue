<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { barPath, niceScale } from '@/lib/chart'
import { useElementSize } from '@/composables/useElementSize'
import ChartFrame from './ChartFrame.vue'
import type { LegendItem, TeamStanding } from '@/lib/types'

const props = defineProps<{ rows: TeamStanding[]; quarters: number[] }>()

const { t, locale } = useI18n()

const host = ref<HTMLElement | null>(null)
const { width } = useElementSize(host)

const rtl = computed(() => locale.value === 'ar')

/**
 * مقاسان: عادي للكمبيوتر، وكبير لما يتسع الرسم (شاشة التلفزيون) — النص
 * بالبكسل الحقيقي داخل SVG، فلا يكبر وحده مع الشاشة.
 */
const wide = computed(() => width.value >= 720)
const size = computed(() =>
  wide.value
    ? { label: 160, value: 88, bar: 18, rowPad: 26, name: 16, num: 14 }
    : { label: 132, value: 64, bar: 14, rowPad: 20, name: 13, num: 12 },
)
const GAP = 2 // فجوة بلون السطح بين القضبان المتلاصقة
const TOP = 8
const X_BAND = 26

/** الألوان تتبع الربع لا الترتيب — فلترة الفروع لا تعيد تلوين الباقين. */
const QUARTER_COLORS = [
  'var(--chart-q1)',
  'var(--chart-q2)',
  'var(--chart-q3)',
  'var(--chart-q4)',
]

interface TeamRow {
  id: string
  name: string
  values: Array<{ quarter: number; value: number }>
  total: number
}

const teams = computed<TeamRow[]>(() => {
  const byTeam = new Map<string, TeamRow>()
  for (const row of props.rows) {
    if (!props.quarters.includes(row.quarter)) continue
    let entry = byTeam.get(row.team_id)
    if (!entry) {
      entry = {
        id: row.team_id,
        name: rtl.value && row.name_ar ? row.name_ar : row.name,
        values: [],
        total: 0,
      }
      byTeam.set(row.team_id, entry)
    }
    const value = Number(row.deals) || 0
    entry.values.push({ quarter: row.quarter, value })
    entry.total += value
  }
  for (const entry of byTeam.values()) {
    entry.values.sort((a, b) => a.quarter - b.quarter)
  }
  return [...byTeam.values()].sort((a, b) => b.total - a.total)
})

const maxValue = computed(() => {
  let max = 0
  for (const team of teams.value) {
    for (const v of team.values) if (v.value > max) max = v.value
  }
  return max
})

const top = computed(() => niceScale(maxValue.value, 3).top)

/** ارتفاع مجموعة قضبان الفرع الواحد بدون الحشوة. */
const stackHeight = computed(
  () => props.quarters.length * size.value.bar + (props.quarters.length - 1) * GAP,
)
const groupHeight = computed(() => stackHeight.value + size.value.rowPad)

const plot = computed(() => {
  const w = Math.max(width.value, 320)
  const h = TOP + teams.value.length * groupHeight.value + X_BAND
  // القضبان تنمو من جهة بداية القراءة، كما تفعل أشرطة التقدّم في اللوحة
  const start = rtl.value ? w - size.value.label : size.value.label
  const end = rtl.value ? size.value.value : w - size.value.value
  return { w, h, start, end, span: Math.abs(end - start) }
})

function barLength(value: number) {
  return top.value > 0 ? (value / top.value) * plot.value.span : 0
}

function pathFor(value: number, y: number) {
  const length = barLength(value)
  const bar = size.value.bar
  return rtl.value
    ? barPath(plot.value.start - length, y, length, bar, 4, true)
    : barPath(plot.value.start, y, length, bar, 4, false)
}

function rowY(index: number) {
  return TOP + index * groupHeight.value + size.value.rowPad / 2
}

function barY(rowIndex: number, seriesIndex: number) {
  return rowY(rowIndex) + seriesIndex * (size.value.bar + GAP)
}

/** طرف القضيب — موضع قيمة الربع الأخير. */
function tipX(value: number) {
  const length = barLength(value)
  return rtl.value ? plot.value.start - length - 6 : plot.value.start + length + 6
}

const latestQuarter = computed(() => Math.max(...props.quarters))

// لا وسيلة إيضاح لرسم فارغ: لا علامات تشرحها
const legend = computed<LegendItem[]>(() =>
  (teams.value.length ? props.quarters : []).map((q) => ({
    label: t('quarter.short', { n: q }),
    color: QUARTER_COLORS[q - 1],
    kind: 'swatch' as const,
  })),
)

const hovered = ref<{ team: string; quarter: number; value: number } | null>(null)
</script>

<template>
  <ChartFrame :title="t('chart.compare')" :subtitle="t('chart.compareSub')" :legend="legend">
    <div ref="host" class="relative w-full min-w-0">
      <p v-if="!teams.length" class="m-0 py-12 text-center font-medium text-mute text-sm">
        {{ t('chart.noHistory') }}
      </p>

      <svg
        v-else
        :width="plot.w"
        :height="plot.h"
        :viewBox="`0 0 ${plot.w} ${plot.h}`"
        role="img"
        :aria-label="t('chart.compare')"
        class="block max-w-full"
        style="direction: ltr"
      >
        <!--
          direction: ltr إلزامي: SVG يرث اتجاه الصفحة، وفي RTL ينقلب معنى
          text-anchor فتُرسم الأسماء تحت القضبان وتُقصّ. الإحداثيات هنا
          محسوبة يدوياً لكل اتجاه، والنص العربي يتشكّل صحيحاً في الحالتين.
        -->
        <!-- خط الأساس: خط شعري صلب واحد -->
        <line
          :x1="plot.start"
          :x2="plot.start"
          :y1="TOP"
          :y2="plot.h - X_BAND"
          stroke="var(--chart-grid)"
          stroke-width="1"
          shape-rendering="crispEdges"
        />

        <g v-for="(team, i) in teams" :key="team.id">
          <!-- اسم الفرع بلون النص لا بلون السلسلة -->
          <text
            :x="rtl ? plot.start + 12 : plot.start - 12"
            :y="rowY(i) + stackHeight / 2"
            dominant-baseline="central"
            :text-anchor="rtl ? 'start' : 'end'"
            :font-size="size.name"
            class="fill-[var(--color-strong)] font-semibold"
          >{{ team.name }}</text>

          <g v-for="(entry, j) in team.values" :key="entry.quarter">
            <path
              :d="pathFor(entry.value, barY(i, j))"
              :fill="QUARTER_COLORS[entry.quarter - 1]"
            />
            <!-- منطقة التقاط بارتفاع الخانة كاملة: أكبر من القضيب نفسه -->
            <rect
              :x="rtl ? size.value : plot.start"
              :y="barY(i, j) - GAP"
              :width="Math.max(plot.span, 0)"
              :height="size.bar + GAP * 2"
              fill="transparent"
              @pointerenter="hovered = { team: team.name, quarter: entry.quarter, value: entry.value }"
              @pointerleave="hovered = null"
            >
              <title>{{ team.name }} · {{ t('quarter.short', { n: entry.quarter }) }} · {{ egp(entry.value) }}</title>
            </rect>

            <!-- عنوان مباشر للربع الأحدث فقط — رقم على كل قضيب فوضى -->
            <text
              v-if="entry.quarter === latestQuarter"
              :x="tipX(entry.value)"
              :y="barY(i, j) + size.bar / 2"
              dominant-baseline="central"
              :text-anchor="rtl ? 'end' : 'start'"
              :font-size="size.num"
              class="fill-[var(--color-strong)] font-bold tabular-nums"
            >{{ compact(entry.value) }}</text>
          </g>
        </g>
      </svg>

      <div
        v-if="hovered"
        class="pointer-events-none absolute bottom-0 end-0 rounded-lg border border-card-border bg-card px-3 py-2 shadow-[var(--shadow-panel)]"
      >
        <p class="m-0 font-semibold text-strong text-caption">{{ hovered.team }}</p>
        <p class="m-0 mt-0.5 flex items-center gap-2 text-caption text-mute">
          <span
            aria-hidden="true"
            class="w-3 h-3 rounded-[3px] shrink-0"
            :style="{ backgroundColor: QUARTER_COLORS[hovered.quarter - 1] }"
          />
          {{ t('quarter.short', { n: hovered.quarter }) }} · {{ egp(hovered.value) }}
        </p>
      </div>
    </div>

    <template #table>
      <table class="w-full border-collapse text-caption lg:text-sm">
        <thead>
          <tr class="border-b border-card-border">
            <th class="py-2 pe-4 text-start font-medium text-mute whitespace-nowrap">
              {{ t('table.team') }}
            </th>
            <th
              v-for="q in quarters"
              :key="q"
              class="py-2 px-3 text-end font-medium text-mute whitespace-nowrap"
            >{{ t('quarter.short', { n: q }) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="team in teams" :key="team.id" class="border-b border-divider last:border-b-0">
            <td class="py-2 pe-4 font-semibold text-strong whitespace-nowrap">{{ team.name }}</td>
            <td
              v-for="q in quarters"
              :key="q"
              class="py-2 px-3 text-end text-mute tabular-nums whitespace-nowrap"
              :title="egp(team.values.find((v) => v.quarter === q)?.value ?? 0)"
            >
              {{
                team.values.find((v) => v.quarter === q)
                  ? compact(team.values.find((v) => v.quarter === q)!.value)
                  : '—'
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </ChartFrame>
</template>
