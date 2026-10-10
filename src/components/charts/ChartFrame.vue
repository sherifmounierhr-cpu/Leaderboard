<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LegendItem } from '@/lib/types'

defineProps<{
  title: string
  subtitle?: string
  legend?: LegendItem[]
  icon?: string
  /** الرقم الذي يلخّص الرسم — يُقرأ من آخر الغرفة قبل تفاصيل الرسم نفسه. */
  stat?: { value: string; label: string } | null
}>()

const { t } = useI18n()
/** توأم الجدول: كل قيمة في الرسم يمكن قراءتها نصياً أيضاً. */
const showTable = ref(false)
</script>

<template>
  <section
    class="rise flex flex-col gap-4 lg:gap-[clamp(10px,1.8vh,20px)] rounded-2xl border border-card-border bg-card p-5 lg:p-[clamp(18px,2.6vh,30px)] shadow-[var(--shadow-panel)] min-w-0 min-h-0"
  >
    <header class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div class="flex min-w-0 items-center gap-3 lg:gap-4">
        <span
          v-if="icon"
          class="hidden sm:flex shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text size-11 lg:size-[clamp(44px,5.2vh,58px)] text-2xl lg:text-[clamp(22px,2.8vh,32px)]"
          aria-hidden="true"
        >
          <iconify-icon :icon="icon" />
        </span>
        <div class="min-w-0">
          <h2 class="m-0 font-extrabold tracking-[-0.01em] text-strong text-lg lg:text-[clamp(20px,2.7vh,30px)]">{{ title }}</h2>
          <p v-if="subtitle" class="m-0 mt-1 font-medium text-mute text-caption lg:text-[clamp(13px,1.6vh,17px)]">
            {{ subtitle }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-4 ms-auto">
        <p v-if="stat" class="m-0 flex flex-col items-end leading-tight">
          <b class="font-extrabold tabular-nums text-accent-text text-xl lg:text-[clamp(22px,3.2vh,36px)]">{{ stat.value }}</b>
          <span class="font-medium text-mute text-caption lg:text-[clamp(12px,1.5vh,16px)]">{{ stat.label }}</span>
        </p>
        <button
          type="button"
          data-export-hide
          data-kiosk-hide
          class="shrink-0 inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors duration-200 hover:border-accent/50 hover:text-strong"
          :aria-pressed="showTable"
          @click="showTable = !showTable"
        >
          <iconify-icon :icon="showTable ? 'mdi:chart-line' : 'mdi:table'" aria-hidden="true" />
          {{ showTable ? t('chart.showChart') : t('chart.showTable') }}
        </button>
      </div>
    </header>

    <!-- وسيلة الإيضاح حاضرة دائماً لسلسلتين فأكثر: الهوية لا تعتمد على اللون وحده -->
    <ul
      v-if="legend && legend.length > 1 && !showTable"
      class="flex flex-wrap items-center gap-x-5 gap-y-2 m-0 p-0 list-none"
    >
      <li v-for="item in legend" :key="item.label" class="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          class="shrink-0"
          :class="item.kind === 'line' ? 'w-5 h-[3px] rounded-full' : 'size-3.5 rounded-[4px]'"
          :style="{ backgroundColor: item.color }"
        />
        <span class="font-medium text-mute text-caption lg:text-[clamp(13px,1.6vh,17px)] truncate">{{ item.label }}</span>
      </li>
    </ul>

    <div v-show="!showTable" class="flex min-h-0 min-w-0 flex-1 flex-col">
      <slot />
    </div>

    <div v-if="showTable" class="min-h-0 min-w-0 flex-1 overflow-auto">
      <slot name="table" />
    </div>
  </section>
</template>
