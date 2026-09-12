<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBoardData } from '@/composables/useBoardData'
import { useIndicator } from '@/composables/useIndicator'

const { quarter, calendarQuarter, setQuarter } = useBoardData()
const { t } = useI18n()

const quarters = [1, 2, 3, 4]
const listEl = ref<HTMLElement | null>(null)
const { indicatorStyle, ready } = useIndicator(listEl, quarter)
</script>

<template>
  <div
    ref="listEl"
    class="relative flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] p-1"
    role="tablist"
    :aria-label="t('quarter.label')"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute left-0 top-0 z-0 rounded-md bg-accent shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
      :class="ready ? 'transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none' : ''"
      :style="indicatorStyle"
    />
    <button
      v-for="q in quarters"
      :key="q"
      type="button"
      role="tab"
      :disabled="q > calendarQuarter"
      :aria-selected="quarter === q"
      :aria-label="q > calendarQuarter ? t('quarter.notStarted', { n: q }) : t('quarter.short', { n: q })"
      :title="q > calendarQuarter ? t('quarter.notStarted', { n: q }) : undefined"
      class="relative z-10 inline-flex items-center justify-center rounded-md px-2.5 sm:px-3 py-1.5 lg:py-2 min-h-11 lg:min-h-0 text-sm font-semibold tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-live focus-visible:ring-offset-2 focus-visible:ring-offset-header disabled:focus-visible:ring-0"
      :class="
        quarter === q
          ? 'text-white'
          : q > calendarQuarter
            ? 'text-white/25 cursor-not-allowed'
            : 'text-white/55 hover:text-white'
      "
      @click="setQuarter(q)"
    >
      {{ t('quarter.short', { n: q }) }}
    </button>
  </div>
</template>
