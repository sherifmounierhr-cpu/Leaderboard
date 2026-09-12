<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LegendItem } from '@/lib/types'

defineProps<{ title: string; subtitle?: string; legend?: LegendItem[] }>()

const { t } = useI18n()
/** توأم الجدول: كل قيمة في الرسم يمكن قراءتها نصياً أيضاً. */
const showTable = ref(false)
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-5 lg:p-6 shadow-[var(--shadow-panel)] min-w-0"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="m-0 font-semibold text-strong text-lg lg:text-metric-sm">{{ title }}</h2>
        <p v-if="subtitle" class="m-0 mt-1 font-medium text-mute text-caption lg:text-note">
          {{ subtitle }}
        </p>
      </div>

      <button
        type="button"
        data-export-hide
        class="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        :aria-pressed="showTable"
        @click="showTable = !showTable"
      >
        <iconify-icon :icon="showTable ? 'mdi:chart-line' : 'mdi:table'" aria-hidden="true" />
        {{ showTable ? t('chart.showChart') : t('chart.showTable') }}
      </button>
    </header>

    <!-- وسيلة الإيضاح حاضرة دائماً لسلسلتين فأكثر: الهوية لا تعتمد على اللون وحده -->
    <ul
      v-if="legend && legend.length > 1 && !showTable"
      class="flex flex-wrap items-center gap-x-4 gap-y-2 m-0 p-0 list-none"
    >
      <li v-for="item in legend" :key="item.label" class="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          class="shrink-0"
          :class="item.kind === 'line' ? 'w-4 h-0.5 rounded-full' : 'w-3 h-3 rounded-[3px]'"
          :style="{ backgroundColor: item.color }"
        />
        <span class="font-medium text-mute text-caption lg:text-sm truncate">{{ item.label }}</span>
      </li>
    </ul>

    <div v-show="!showTable" class="min-w-0">
      <slot />
    </div>

    <div v-if="showTable" class="min-w-0 overflow-x-auto">
      <slot name="table" />
    </div>
  </section>
</template>
