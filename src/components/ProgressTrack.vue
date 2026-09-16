<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePace, type PaceStatus } from '@/composables/usePace'

const props = withDefaults(
  defineProps<{ pct: number; soft?: boolean; tall?: boolean; paced?: boolean }>(),
  { soft: false, tall: false, paced: true },
)

const { t } = useI18n()
const { expectedPct, statusOf } = usePace()

const status = computed<PaceStatus | null>(() => (props.paced ? statusOf(props.pct) : null))
/** العلامة تختفي عند 0 و100: في أول يوم أو ربع منتهي لا تضيف معلومة. */
const marker = computed(() =>
  props.paced && expectedPct.value !== null && expectedPct.value > 0 && expectedPct.value < 100
    ? expectedPct.value
    : null,
)

const FILL: Record<PaceStatus, string> = {
  ahead: 'from-accent to-accent-strong',
  close: 'from-gold to-gold',
  behind: 'from-down to-down',
}
</script>

<template>
  <div class="relative w-full" :title="marker !== null ? t('pace.markerTitle', { pct: marker }) : undefined">
    <div
      class="w-full rounded-full overflow-hidden ring-1 ring-inset ring-strong/5"
      :class="[
        tall ? 'h-3 lg:h-3.5' : 'h-2.5 lg:h-3',
        soft ? 'bg-accent/12' : 'bg-track',
      ]"
    >
      <i
        class="block h-full rounded-full bg-linear-to-b animate-bar-grow transition-[width] duration-700 ease-out motion-reduce:transition-none"
        :class="FILL[status ?? 'ahead']"
        :style="{ width: `${Math.min(pct, 100)}%` }"
      />
    </div>
    <!-- علامة الإيقاع: أين يجب أن يكون الشريط اليوم -->
    <span
      v-if="marker !== null"
      aria-hidden="true"
      class="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-strong/55"
      :style="{ insetInlineStart: `${marker}%` }"
    />
  </div>
</template>
