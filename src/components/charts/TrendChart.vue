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
  /** Ø§Ù„Ù…ØªØµØ¯Ù‘Ø± ÙŠÙØ­Ø¯ÙŽÙ‘Ø¯ Ø¨Ø§Ù„Ù…Ø¹Ø±Ù‘Ù: Ø§Ù„Ù„Ù‚Ø·Ø§Øª ØªØ®Ø²Ù‘Ù† Ø§Ù„Ø§Ø³Ù… Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠ ÙÙ‚Ø·. */
  leaderId: string
  /** Ù…Ø¹Ø±Ù‘Ù Ø§Ù„ÙØ±Ø¹ â†’ Ø§Ø³Ù…Ù‡ Ø¨Ù„ØºØ© Ø§Ù„Ø¹Ø±Ø¶. */
  names: Record<string, string>
}>()

const { t, locale } = useI18n()

const host = ref<HTMLElement | null>(null)
const { width } = useElementSize(host)

const rtl = computed(() => locale.value === 'ar')

/**
 * Ø¹Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„ÙˆØ§Ø³Ø¹Ø© (Ø§Ù„ØªÙ„ÙØ²ÙŠÙˆÙ†) ÙŠÙƒØ¨Ø± Ø§Ù„Ù†Øµ ÙˆØ§Ù„Ø±Ø³Ù…ØŒ ÙˆÙŠÙØ¹Ù†ÙˆÙŽÙ† ÙƒÙ„ Ø®Ø· Ø¨Ø§Ø³Ù…Ù‡ Ø¹Ù†Ø¯
 * Ù†Ù‡Ø§ÙŠØªÙ‡ â€” Ù…Ù† Ø¨Ø¹ÙŠØ¯ Ù„Ø§ Ø£Ø­Ø¯ ÙŠÙ…Ø±Ù‘Ø± Ø§Ù„Ù…Ø§ÙˆØ³ Ù„ÙŠØ¹Ø±Ù Ø£ÙŠ Ø®Ø· Ø±Ù…Ø§Ø¯ÙŠ Ù„Ø£ÙŠ ÙØ±Ø¹.
 */
const wide = computed(() => width.value >= 500)
const size = computed(() =>
  wide.value
    ? { tick: 13, label: 14, axis: 64, endBand: width.value >= 720 ? 150 : 120, xBand: 36 }
    : { tick: 11, label: 12, axis: 52, endBand: 26, xBand: 30 },
)

/** Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® Ø§Ù„Ù…ØªØ§Ø­Ø© Ù…Ø±ØªØ¨Ø© ØªØµØ§Ø¹Ø¯ÙŠØ§Ù‹. */
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
    // Ø§Ù„Ù…ØªØµØ¯Ù‘Ø± ÙŠÙØ±Ø³Ù… Ø£Ø®ÙŠØ±Ø§Ù‹ Ù„ÙŠØ¹Ù„Ùˆ Ø¨Ù‚ÙŠØ© Ø§Ù„Ø®Ø·ÙˆØ·
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
  const h = wide.value ? Math.round(Math.min(Math.max(w * 0.55, 320), 500)) : 300
  // Ø§Ù„Ø·Ø±Ù Ø§Ù„Ù…Ù‚Ø§Ø¨Ù„ Ù„Ù„Ù…Ø­ÙˆØ± ÙŠØ­Ù…Ù„ Ù†Ù‡Ø§ÙŠØ§Øª Ø§Ù„Ø®Ø·ÙˆØ· ÙˆØ£Ø³Ù…Ø§Ø¡Ù‡Ø§ØŒ ÙÙŠØ­ØªØ§Ø¬ Ù‡Ø§Ù…Ø´Ø§Ù‹ Ù„Ø§ ÙŠÙ‚ØµÙ‘Ù‡Ø§
  const { axis, endBand, xBand } = size.value
  return {
    w,
    h,
    x0: rtl.value ? endBand : axis,
    x1: w - (rtl.value ? axis : endBand),
    y0: 18,
    y1: h - xBand,
  }
})

const scale = computed(() => niceScale(maxValue.value))
const top = computed(() => scale.value.top)
const xScale = computed(() =>
  makeXScale([0, Math.max(dates.value.length - 1, 1)], [plot.value.x0, plot.value.x1], rtl.value),
)
const yScale = computed(() => makeYScale([0, top.value], [plot.value.y1, plot.value.y0]))

const ticks = computed(() => scale.value.ticks)

/** Ù†Ù‚Ø§Ø· Ø§Ù„Ù…Ø­ÙˆØ± Ø§Ù„Ø£ÙÙ‚ÙŠ: 5 ØªÙˆØ§Ø±ÙŠØ® ÙƒØ­Ø¯Ù‘ Ø£Ù‚ØµÙ‰ Ø­ØªÙ‰ Ù„Ø§ ØªØªØ±Ø§ÙƒÙ…. */
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

/**
 * Ø§Ø³Ù… ÙƒÙ„ ÙØ±Ø¹ Ø¹Ù†Ø¯ Ù†Ù‡Ø§ÙŠØ© Ø®Ø·Ù‡ØŒ Ù…Ø¹ Ø¯ÙØ¹ Ø§Ù„Ø£Ø³Ù…Ø§Ø¡ Ø§Ù„Ù…ØªÙ‚Ø§Ø±Ø¨Ø© Ø¨Ø¹ÙŠØ¯Ø§Ù‹ Ø¹Ù† Ø¨Ø¹Ø¶Ù‡Ø§ Ø­ØªÙ‰
 * Ù„Ø§ ØªØªØ±Ø§ÙƒØ¨ (Ø§Ù„Ø®Ø·ÙˆØ· ØªÙ†ØªÙ‡ÙŠ ØºØ§Ù„Ø¨Ø§Ù‹ Ø¹Ù†Ø¯ Ù‚ÙŠÙ… Ù…ØªÙ‚Ø§Ø±Ø¨Ø©).
 */
const endLabels = computed(() => {
  if (!wide.value) return []
  const gap = size.value.label + 6
  const items = series.value
    .map((s) => {
      const end = lastPoint(s)
      return end ? { id: s.id, name: s.name, isLeader: s.isLeader, y: end.y } : null
    })
    .filter((x): x is { id: string; name: string; isLeader: boolean; y: number } => x !== null)
    .sort((a, b) => a.y - b.y)

  for (let i = 1; i < items.length; i++) {
    items[i].y = Math.max(items[i].y, items[i - 1].y + gap)
  }
  // Ù„Ùˆ ØªØ¬Ø§ÙˆØ² Ø¢Ø®Ø±Ù‡Ø§ Ø£Ø³ÙÙ„ Ø§Ù„Ø±Ø³Ù… Ù†Ø±ÙØ¹ Ø§Ù„ÙƒÙ„ Ù…Ù† Ø§Ù„Ø£Ø³ÙÙ„ Ù„Ù„Ø£Ø¹Ù„Ù‰
  const bottom = plot.value.y1
  if (items.length && items[items.length - 1].y > bottom) {
    items[items.length - 1].y = bottom
    for (let i = items.length - 2; i >= 0; i--) {
      items[i].y = Math.min(items[i].y, items[i + 1].y - gap)
    }
  }
  const x = rtl.value ? plot.value.x0 - 12 : plot.value.x1 + 12
  return items.map((item) => ({ ...item, x }))
})

// ------------------------------------------------------------------ hover
const activeIndex = ref<number | null>(null)

function onPointerMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect()
  // Ø¹Ù„Ù‰ Ø´Ø§Ø´Ø© Ø£Ø¶ÙŠÙ‚ Ù…Ù† Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ ÙŠÙØµØºÙŽÙ‘Ø± Ø§Ù„Ù€ SVG Ø¨Ù€ max-widthØŒ ÙÙ†Ù‚Ø³Ù… Ø¹Ù„Ù‰ Ø§Ù„Ù†Ø³Ø¨Ø©
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

// Ù„Ø§ ÙˆØ³ÙŠÙ„Ø© Ø¥ÙŠØ¶Ø§Ø­ Ù„Ø±Ø³Ù… ÙØ§Ø±Øº: Ù„Ø§ Ø¹Ù„Ø§Ù…Ø§Øª ØªØ´Ø±Ø­Ù‡Ø§
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
          style="direction: ltr"
        >
          <!-- direction: ltr: ÙÙŠ RTL ÙŠÙ†Ù‚Ù„Ø¨ Ù…Ø¹Ù†Ù‰ text-anchor ÙØªÙÙ‚ØµÙ‘ Ø§Ù„Ø¹Ù„Ø§Ù…Ø§ØªØ› Ø§Ù„Ø¥Ø­Ø¯Ø§Ø«ÙŠØ§Øª Ù…Ø­Ø³ÙˆØ¨Ø© Ù„ÙƒÙ„ Ø§ØªØ¬Ø§Ù‡ -->
          <!-- Ø´Ø¨ÙƒØ© Ø£ÙÙ‚ÙŠØ©: Ø®Ø·ÙˆØ· Ø´Ø¹Ø±ÙŠØ© ØµÙ„Ø¨Ø©ØŒ Ù…ØªØ±Ø§Ø¬Ø¹Ø© Ø¨ØµØ±ÙŠØ§Ù‹ -->
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

          <!-- Ø¹Ù„Ø§Ù…Ø§Øª Ø§Ù„Ù…Ø­ÙˆØ± Ø§Ù„Ø±Ø£Ø³ÙŠ Ø¹Ù„Ù‰ Ø¬Ù‡Ø© Ø¨Ø¯Ø§ÙŠØ© Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© -->
          <g>
            <text
              v-for="tick in ticks"
              :key="`t${tick}`"
              :x="rtl ? plot.x1 + 10 : plot.x0 - 10"
              :y="yScale(tick) + 4"
              :text-anchor="rtl ? 'start' : 'end'"
              :font-size="size.tick"
              class="fill-[var(--color-mute)] tabular-nums"
            >{{ compact(tick) }}</text>
          </g>

          <!-- Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® -->
          <g>
            <text
              v-for="i in dateTicks"
              :key="`d${i}`"
              :x="xScale(i)"
              :y="plot.y1 + size.tick + 10"
              text-anchor="middle"
              :font-size="size.tick"
              class="fill-[var(--color-mute)] tabular-nums"
            >{{ formatDate(dates[i]) }}</text>
          </g>

          <!-- Ø®Ø· Ø§Ù„ØªÙ‚Ø§Ø·Ø¹ Ø¹Ù†Ø¯ Ø§Ù„ØªØ­ÙˆÙŠÙ… -->
          <line
            v-if="tooltip"
            :x1="tooltip.x"
            :x2="tooltip.x"
            :y1="plot.y0"
            :y2="plot.y1"
            stroke="var(--color-dim)"
            stroke-width="1"
          />

          <!-- Ø§Ù„Ø®Ø·ÙˆØ·: Ø§Ù„Ù…ØªØµØ¯Ù‘Ø± Ø¨Ù„ÙˆÙ† Ø§Ù„Ø¥Ø¨Ø±Ø§Ø² ÙˆØ§Ù„Ø¨Ù‚ÙŠØ© Ø³ÙŠØ§Ù‚ Ø±Ù…Ø§Ø¯ÙŠ -->
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

          <!-- Ù†Ù‚Ø·Ø© Ù†Ù‡Ø§ÙŠØ© Ø§Ù„Ù…ØªØµØ¯Ù‘Ø± Ù…Ø¹ Ø­Ù„Ù‚Ø© Ø¨Ù„ÙˆÙ† Ø§Ù„Ø³Ø·Ø­ -->
          <circle
            v-if="leaderEnd"
            :cx="leaderEnd.x"
            :cy="leaderEnd.y"
            r="4.5"
            fill="var(--chart-emphasis)"
            stroke="var(--chart-surface)"
            stroke-width="2"
          />

          <!-- Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„ÙˆØ§Ø³Ø¹Ø©: Ø§Ø³Ù… ÙƒÙ„ Ø®Ø· Ø¹Ù†Ø¯ Ù†Ù‡Ø§ÙŠØªÙ‡ -->
          <text
            v-for="label in endLabels"
            :key="`l${label.id}`"
            :x="label.x"
            :y="label.y"
            dominant-baseline="central"
            :text-anchor="rtl ? 'end' : 'start'"
            :font-size="size.label"
            :class="label.isLeader ? 'fill-[var(--chart-emphasis)] font-bold' : 'fill-[var(--color-mute)] font-medium'"
          >{{ label.name }}</text>

          <!-- Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„Ø¶ÙŠÙ‚Ø©: Ø¹Ù†ÙˆØ§Ù† Ù…Ø¨Ø§Ø´Ø± ÙˆØ§Ø­Ø¯ Ù„Ù„Ù…ØªØµØ¯Ù‘Ø±ØŒ ÙˆØ§Ù„Ø¨Ù‚ÙŠØ© Ø¹Ù„Ù‰ Ø§Ù„Ù€ tooltip ÙˆØ§Ù„Ø¬Ø¯ÙˆÙ„ -->
          <text
            v-if="!wide && leaderEnd && leader"
            :x="leaderEnd.x + (rtl ? 10 : -10)"
            :y="leaderEnd.y - 12"
            :text-anchor="rtl ? 'start' : 'end'"
            class="fill-[var(--color-strong)] text-[12px] font-semibold"
          >{{ leader.name }}</text>

          <!-- Ø·Ø¨Ù‚Ø© Ø§Ù„Ø§Ù„ØªÙ‚Ø§Ø·: ÙƒØ§Ù…Ù„ Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ø±Ø³Ù…ØŒ Ø£ÙƒØ¨Ø± Ø¨ÙƒØ«ÙŠØ± Ù…Ù† Ø£ÙŠ Ø¹Ù„Ø§Ù…Ø© -->
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

        <!-- Ø§Ù„Ù€ tooltip ÙŠÙØ«Ø±ÙŠ ÙˆÙ„Ø§ ÙŠØ­Ø¬Ø¨: ÙƒÙ„ Ø§Ù„Ù‚ÙŠÙ… Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ ØªÙˆØ£Ù… Ø§Ù„Ø¬Ø¯ÙˆÙ„ -->
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
            >{{ s.values[i] == null ? 'â€”' : compact(s.values[i]) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </ChartFrame>
</template>
