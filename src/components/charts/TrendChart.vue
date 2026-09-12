<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { linePath, makeXScale, makeYScale, nearestIndex, niceScale } from '@/lib/chart'
import { useElementSize } from '@/composables/useElementSize'
import ChartFrame from './ChartFrame.vue'
import type { LegendItem, RankHistoryPoint } from '@/lib/types'

const props = defineProps<{
  history: RankHistoryPoint[]
  /** المتصدّر يُحدَّد بالمعرّف: اللقطات تخزّن الاسم الإنجليزي فقط. */
  leaderId: string
  /** معرّف الفرع → اسمه بلغة العرض. */
  names: Record<string, string>
}>()

const { t, locale } = useI18n()

const host = ref<HTMLElement | null>(null)
const { width } = useElementSize(host)

const HEIGHT = 300
const AXIS_BAND = 52 // مساحة علامات المحور الرأسي
const X_BAND = 30 // شريط التواريخ أسفل الرسم — جزء من الارتفاع لا خارجه
const END_PAD = 26 // متّسع لنقطة نهاية المتصدّر وحلقتها
const rtl = computed(() => locale.value === 'ar')

/** التواريخ المتاحة مرتبة تصاعدياً. */
const dates = computed(() => {
  const set = new Set(props.history.map((p) => p.taken_on))
  return [...set].sort()
})

interface TrendSeries {
  id: string
  name: string
  values: Array<number | null>
  isLeader: boolean
}

const series = computed<TrendSeries[]>(() => {
  const byEntity = new Map<string, { name: string; points: Map<string, number> }>()
  for (const row of props.history) {
    let entry = byEntity.get(row.entity_id)
    if (!entry) {
      entry = { name: row.entity_name, points: new Map() }
      byEntity.set(row.entity_id, entry)
    }
    entry.points.set(row.taken_on, Number(row.deals) || 0)
  }

  return [...byEntity.entries()]
    .map(([id, entry]) => ({
      id,
      name: props.names[id] ?? entry.name,
      values: dates.value.map((d) => entry.points.get(d) ?? null),
      isLeader: id === props.leaderId,
    }))
    // المتصدّر يُرسم أخيراً ليعلو بقية الخطوط
    .sort((a, b) => Number(a.isLeader) - Number(b.isLeader))
})

const maxValue = computed(() => {
  let max = 0
  for (const s of series.value) {
    for (const v of s.values) if (v != null && v > max) max = v
  }
  return max
})

const plot = computed(() => {
  const w = Math.max(width.value, 320)
  // الطرف المقابل للمحور يحمل نقطة النهاية وحلقتها، فيحتاج هامشاً لا يقصّها
  const axisLeft = rtl.value ? END_PAD : AXIS_BAND
  const axisRight = rtl.value ? AXIS_BAND : END_PAD
  return {
    w,
    h: HEIGHT,
    x0: axisLeft,
    x1: w - axisRight,
    y0: 18,
    y1: HEIGHT - X_BAND,
  }
})

const scale = computed(() => niceScale(maxValue.value))
const top = computed(() => scale.value.top)
const xScale = computed(() =>
  makeXScale([0, Math.max(dates.value.length - 1, 1)], [plot.value.x0, plot.value.x1], rtl.value),
)
const yScale = computed(() => makeYScale([0, top.value], [plot.value.y1, plot.value.y0]))

const ticks = computed(() => scale.value.ticks)

/** نقاط المحور الأفقي: 5 تواريخ كحدّ أقصى حتى لا تتراكم. */
const dateTicks = computed(() => {
  const n = dates.value.length
  if (!n) return []
  const step = Math.max(1, Math.ceil(n / 5))
  const out: number[] = []
  for (let i = 0; i < n; i += step) out.push(i)
  if (out[out.length - 1] !== n - 1) out.push(n - 1)
  return out
})

const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(rtl.value ? 'ar-EG-u-nu-latn' : 'en-US', {
      day: 'numeric',
      month: 'short',
    }),
)

function formatDate(iso: string) {
  return dateFormatter.value.format(new Date(`${iso}T00:00:00`))
}

function pathFor(s: TrendSeries) {
  const points = s.values
    .map((v, i) => (v == null ? null : { x: xScale.value(i), y: yScale.value(v) }))
    .filter((p): p is { x: number; y: number } => p !== null)
  return linePath(points)
}

function lastPoint(s: TrendSeries) {
  for (let i = s.values.length - 1; i >= 0; i--) {
    const v = s.values[i]
    if (v != null) return { x: xScale.value(i), y: yScale.value(v), value: v }
  }
  return null
}

const leader = computed(() => series.value.find((s) => s.isLeader) ?? null)
const leaderEnd = computed(() => (leader.value ? lastPoint(leader.value) : null))

// ------------------------------------------------------------------ hover
const activeIndex = ref<number | null>(null)

function onPointerMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()
  // على شاشة أضيق من الحد الأدنى يُصغَّر الـ SVG بـ max-width، فنقسم على النسبة
  const drawn = plot.value.x1 - plot.value.x0
  const scale = drawn > 0 && rect.width > 0 ? rect.width / drawn : 1
  const x = (event.clientX - rect.left) / scale + plot.value.x0
  const positions = dates.value.map((_, i) => xScale.value(i))
  activeIndex.value = nearestIndex(positions, x)
}

function onKeydown(event: KeyboardEvent) {
  const n = dates.value.length
  if (!n) return
  const current = activeIndex.value ?? n - 1
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const forward = event.key === (rtl.value ? 'ArrowLeft' : 'ArrowRight')
    activeIndex.value = Math.min(n - 1, Math.max(0, current + (forward ? 1 : -1)))
    event.preventDefault()
  } else if (event.key === 'Escape') {
    activeIndex.value = null
  }
}

const tooltip = computed(() => {
  const i = activeIndex.value
  if (i == null || !dates.value[i]) return null
  const rows = series.value
    .map((s) => ({ name: s.name, value: s.values[i], isLeader: s.isLeader }))
    .filter((r) => r.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number))
  return { date: dates.value[i], x: xScale.value(i), rows }
})

// لا وسيلة إيضاح لرسم فارغ: لا علامات تشرحها
const legend = computed<LegendItem[]>(() => dates.value.length < 2 ? [] : [
  {
    label: props.names[props.leaderId] || t('chart.leader'),
    color: 'var(--chart-emphasis)',
    kind: 'line',
  },
  { label: t('chart.otherTeams'), color: 'var(--chart-context)', kind: 'line' },
])
</script>

<template>
  <ChartFrame :title="t('chart.trend')" :subtitle="t('chart.trendSub')" :legend="legend">
    <div ref="host" class="relative w-full min-w-0">
      <p v-if="dates.length < 2" class="m-0 py-12 text-center font-medium text-mute text-sm">
        {{ t('chart.noHistory') }}
      </p>

      <template v-else>
        <svg
          :width="plot.w"
          :height="plot.h"
          :viewBox="`0 0 ${plot.w} ${plot.h}`"
          role="img"
          :aria-label="t('chart.trend')"
          class="block max-w-full overflow-visible"
        >
          <!-- شبكة أفقية: خطوط شعرية صلبة، متراجعة بصرياً -->
          <g>
            <line
              v-for="tick in ticks"
              :key="`g${tick}`"
              :x1="plot.x0"
              :x2="plot.x1"
              :y1="yScale(tick)"
              :y2="yScale(tick)"
              stroke="var(--chart-grid)"
              stroke-width="1"
              shape-rendering="crispEdges"
            />
          </g>

          <!-- علامات المحور الرأسي على جهة بداية القراءة -->
          <g>
            <text
              v-for="tick in ticks"
              :key="`t${tick}`"
              :x="rtl ? plot.x1 + 10 : plot.x0 - 10"
              :y="yScale(tick) + 4"
              :text-anchor="rtl ? 'start' : 'end'"
              class="fill-[var(--color-dim)] text-[11px] tabular-nums"
            >{{ compact(tick) }}</text>
          </g>

          <!-- التواريخ -->
          <g>
            <text
              v-for="i in dateTicks"
              :key="`d${i}`"
              :x="xScale(i)"
              :y="plot.y1 + 20"
              text-anchor="middle"
              class="fill-[var(--color-dim)] text-[11px] tabular-nums"
            >{{ formatDate(dates[i]) }}</text>
          </g>

          <!-- خط التقاطع عند التحويم -->
          <line
            v-if="tooltip"
            :x1="tooltip.x"
            :x2="tooltip.x"
            :y1="plot.y0"
            :y2="plot.y1"
            stroke="var(--color-dim)"
            stroke-width="1"
          />

          <!-- الخطوط: المتصدّر بلون الإبراز والبقية سياق رمادي -->
          <g fill="none" stroke-linejoin="round" stroke-linecap="round">
            <path
              v-for="s in series"
              :key="s.id"
              :d="pathFor(s)"
              :stroke="s.isLeader ? 'var(--chart-emphasis)' : 'var(--chart-context)'"
              :stroke-width="s.isLeader ? 2.5 : 2"
              :opacity="s.isLeader ? 1 : 0.55"
            />
          </g>

          <!-- نقطة نهاية المتصدّر مع حلقة بلون السطح -->
          <circle
            v-if="leaderEnd"
            :cx="leaderEnd.x"
            :cy="leaderEnd.y"
            r="4.5"
            fill="var(--chart-emphasis)"
            stroke="var(--chart-surface)"
            stroke-width="2"
          />

          <!-- عنوان مباشر واحد فقط: المتصدّر. البقية على الـ tooltip والجدول -->
          <text
            v-if="leaderEnd && leader"
            :x="leaderEnd.x + (rtl ? 10 : -10)"
            :y="leaderEnd.y - 12"
            :text-anchor="rtl ? 'start' : 'end'"
            class="fill-[var(--color-strong)] text-[12px] font-semibold"
          >{{ leader.name }}</text>

          <!-- طبقة الالتقاط: كامل مساحة الرسم، أكبر بكثير من أي علامة -->
          <rect
            :x="plot.x0"
            :y="plot.y0"
            :width="Math.max(plot.x1 - plot.x0, 0)"
            :height="Math.max(plot.y1 - plot.y0, 0)"
            fill="transparent"
            tabindex="0"
            role="application"
            :aria-label="t('chart.trendHint')"
            class="focus-visible:outline-2 focus-visible:outline-accent cursor-crosshair"
            @pointermove="onPointerMove"
            @pointerleave="activeIndex = null"
            @keydown="onKeydown"
            @blur="activeIndex = null"
          />
        </svg>

        <!-- الـ tooltip يُثري ولا يحجب: كل القيم موجودة في توأم الجدول -->
        <div
          v-if="tooltip"
          class="pointer-events-none absolute top-2 z-10 rounded-lg border border-card-border bg-card px-3 py-2 shadow-[var(--shadow-panel)] min-w-40"
          :style="
            tooltip.x > plot.w / 2
              ? { left: '8px' }
              : { right: '8px' }
          "
        >
          <p class="m-0 mb-1.5 font-semibold text-strong text-caption">{{ formatDate(tooltip.date) }}</p>
          <ul class="m-0 p-0 list-none flex flex-col gap-1">
            <li
              v-for="row in tooltip.rows"
              :key="row.name"
              class="flex items-center justify-between gap-3 text-caption"
            >
              <span class="flex items-center gap-1.5 min-w-0">
                <span
                  aria-hidden="true"
                  class="w-2.5 h-0.5 rounded-full shrink-0"
                  :style="{ backgroundColor: row.isLeader ? 'var(--chart-emphasis)' : 'var(--chart-context)' }"
                />
                <span class="truncate" :class="row.isLeader ? 'text-strong font-semibold' : 'text-mute'">
                  {{ row.name }}
                </span>
              </span>
              <span class="tabular-nums shrink-0" :class="row.isLeader ? 'text-strong font-semibold' : 'text-mute'">
                {{ compact(row.value) }}
              </span>
            </li>
          </ul>
        </div>
      </template>
    </div>

    <template #table>
      <table class="w-full border-collapse text-caption lg:text-sm">
        <thead>
          <tr class="border-b border-card-border">
            <th class="py-2 pe-4 text-start font-medium text-mute whitespace-nowrap">
              {{ t('chart.date') }}
            </th>
            <th
              v-for="s in series"
              :key="s.id"
              class="py-2 px-3 text-end font-medium text-mute whitespace-nowrap"
            >{{ s.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(date, i) in dates" :key="date" class="border-b border-divider last:border-b-0">
            <td class="py-2 pe-4 font-medium text-mute whitespace-nowrap tabular-nums">
              {{ formatDate(date) }}
            </td>
            <td
              v-for="s in series"
              :key="s.id"
              class="py-2 px-3 text-end tabular-nums whitespace-nowrap"
              :class="s.isLeader ? 'text-strong font-semibold' : 'text-mute'"
              :title="s.values[i] == null ? '' : egp(s.values[i])"
            >{{ s.values[i] == null ? '—' : compact(s.values[i]) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </ChartFrame>
</template>
