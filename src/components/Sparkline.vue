<script setup lang="ts">
import { computed } from 'vue'

/** خط اتجاه صغير لآخر شهر — شكل الحركة، مش أرقامها. */
const props = defineProps<{ points: number[]; up: boolean }>()

const W = 100
const H = 32

const path = computed(() => {
  const values = props.points.filter((v) => Number.isFinite(v))
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  // خط أفقي لما القيم متساوية: نص الارتفاع بدل قسمة على صفر
  const span = max - min || 1
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * W
      const y = H - ((value - min) / span) * H
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
})
</script>

<template>
  <svg
    v-if="path"
    :viewBox="`0 -2 ${W} ${H + 4}`"
    preserveAspectRatio="none"
    aria-hidden="true"
    fill="none"
  >
    <path
      :d="path"
      :stroke="up ? 'var(--color-accent-live)' : 'var(--color-down)'"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
