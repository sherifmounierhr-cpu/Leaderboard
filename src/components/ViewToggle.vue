<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardView } from '@/lib/types'
import { useIndicator } from '@/composables/useIndicator'

const props = defineProps<{ view: BoardView }>()
const emit = defineEmits<{ 'update:view': [BoardView] }>()

const { t } = useI18n()

/**
 * `compact` يخفي اسم التبويب على الشاشات الأضيق. تبويب الأخبار رابعٌ زائد،
 * وبعرضه الكامل بيلفّ شريط الترويسة لسطرين على 1366 فيقصّ آخر صف في الجدول.
 */
const options: Array<{ value: BoardView; icon: string; compact?: boolean }> = [
  { value: 'teams', icon: 'mdi:office-building-outline' },
  { value: 'agents', icon: 'mdi:account-tie' },
  { value: 'insights', icon: 'mdi:chart-timeline-variant' },
  { value: 'news', icon: 'mdi:newspaper-variant-outline', compact: true },
  { value: 'markets', icon: 'mdi:chart-line', compact: true },
]

const listEl = ref<HTMLElement | null>(null)
const current = computed(() => props.view)
const { indicatorStyle, ready } = useIndicator(listEl, current)
</script>

<template>
  <div
    ref="listEl"
    class="relative flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.06] p-1"
    role="tablist"
    :aria-label="t('view.toggle')"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none absolute left-0 top-0 z-0 rounded-md bg-accent shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
      :class="ready ? 'transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none' : ''"
      :style="indicatorStyle"
    />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="view === option.value"
      class="relative z-10 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 lg:py-2 min-h-11 lg:min-h-0 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-live focus-visible:ring-offset-2 focus-visible:ring-offset-header"
      :class="view === option.value ? 'text-white' : 'text-white/55 hover:text-white'"
      @click="emit('update:view', option.value)"
    >
      <iconify-icon :icon="option.icon" aria-hidden="true" class="text-base" />
      <span :class="option.compact ? 'hidden 2xl:inline' : 'hidden sm:inline'">{{ t(`view.${option.value}`) }}</span>
    </button>
  </div>
</template>
