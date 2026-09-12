<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBoardData } from '@/composables/useBoardData'

const { status } = useBoardData()
const { t } = useI18n()

const label = computed(() => t(`status.${status.value}`))
const isLive = computed(() => status.value === 'live')
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-md border px-3 py-2 font-semibold tracking-[0.08em] text-sm"
    :class="
      isLive
        ? 'border-accent/40 bg-accent/12 text-accent-live'
        : 'border-white/20 bg-white/[0.06] text-white/65'
    "
    role="status"
    :aria-label="t('status.feed', { status: label })"
  >
    <span
      class="w-2.5 h-2.5 rounded-full"
      :class="
        isLive
          ? 'bg-accent-live animate-pulse-dot shadow-[0_0_7px_rgba(75,189,128,0.55)]'
          : 'bg-white/50'
      "
    />
    <span>{{ label }}</span>
  </div>
</template>
