<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardEntity } from '@/composables/useBoardData'

const props = withDefaults(
  defineProps<{ entity: BoardEntity; kind?: 'agent' | 'team' }>(),
  { kind: 'agent' },
)

const { t } = useI18n()

/**
 * الأحرف الأولى مرسومة دائماً تحت الصورة — فإن سقطت الصورة (شبكة، أو كتمها
 * التصدير تفادياً لتلويث الـ canvas) يبقى شيء مقروء مكانها.
 */
const initials = computed(() =>
  props.entity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
)

const label = computed(() =>
  props.kind === 'team' ? t('a11y.logo', { name: props.entity.name }) : props.entity.name,
)
</script>

<template>
  <div
    class="relative overflow-hidden shrink-0 select-none bg-avatar outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center"
    role="img"
    :aria-label="label"
  >
    <span
      aria-hidden="true"
      class="font-bold text-avatar-text tracking-tight text-[0.9em] leading-none"
    >{{ initials }}</span>

    <span
      v-if="entity.photo"
      aria-hidden="true"
      data-avatar-photo
      class="absolute inset-0 bg-cover bg-center"
      :style="{ backgroundImage: `url('${entity.photo}')` }"
    />
  </div>
</template>
