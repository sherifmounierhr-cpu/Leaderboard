<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{ delta?: number }>(), { delta: 0 })
const { t } = useI18n()
</script>

<template>
  <span
    v-if="delta > 0"
    class="inline-flex items-center gap-0.5 font-bold tabular-nums leading-none text-accent-text"
    :aria-label="t('a11y.up', { n: delta })"
  >
    <iconify-icon icon="mdi:arrow-up-bold" aria-hidden="true" />{{ delta }}
  </span>
  <span
    v-else-if="delta < 0"
    class="inline-flex items-center gap-0.5 font-bold tabular-nums leading-none text-down"
    :aria-label="t('a11y.down', { n: -delta })"
  >
    <iconify-icon icon="mdi:arrow-down-bold" aria-hidden="true" />{{ -delta }}
  </span>
</template>
