<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'
import ProgressTrack from './ProgressTrack.vue'

const props = withDefaults(
  defineProps<{
    entity: BoardEntity
    kind?: 'agent' | 'team'
    /** نص الشريط العلوي — الفرع الأول افتراضياً، ويُستبدل لمتصدّر المستشارين. */
    label?: string
    /** سطر إضافي تحت الاسم؛ يُستخدم لاسم فرع المستشار. */
    subtitle?: string
    /**
     * hero لمنصّة الفروع العريضة، و compact للبطاقة الجانبية الأضيق —
     * الخط الضخم لا يتّسع لـ«4.6 مليون» في عمود عرضه 300 بكسل.
     */
    size?: 'hero' | 'compact'
  }>(),
  { kind: 'team', size: 'hero' },
)

const { t } = useI18n()
const ribbon = computed(() => props.label ?? t('card.topTeam'))
const statSize = computed(() => (props.size === 'hero' ? 'text-stat-hero' : 'text-stat-2'))
</script>

<template>
  <div
    class="relative flex flex-col items-center gap-3.5 lg:gap-[clamp(8px,1.7vh,14px)] rounded-2xl border border-accent/70 bg-card px-6 pb-8 lg:pb-[clamp(16px,3vh,32px)] pt-0 lg:px-8 ring-1 ring-accent/15 shadow-[0_1px_2px_-1px_rgba(27,34,42,0.08),0_24px_50px_-28px_rgba(21,122,74,0.5)] animate-leader-pulse origin-bottom"
  >
    <div
      class="flex items-center gap-2 rounded-b-lg bg-accent-strong px-6 py-2 font-semibold tracking-[0.12em] text-white text-xs lg:text-sm shadow-[0_5px_12px_-5px_rgba(15,99,56,0.6)]"
    >
      <iconify-icon icon="mdi:trophy" aria-hidden="true" class="text-gold text-base lg:text-lg" />
      {{ ribbon }}
    </div>

    <Avatar
      :entity="entity"
      :kind="kind"
      class="size-24 lg:size-[clamp(84px,13.5vh,136px)] rounded-3xl ring-2 ring-accent/80 text-3xl"
    />

    <div class="flex flex-col items-center gap-0.5 w-full">
      <div
        class="w-full font-semibold tracking-[-0.01em] text-center text-strong text-2xl lg:text-[clamp(22px,3.3vh,30px)] text-balance break-words line-clamp-2"
        :title="entity.name"
      >
        {{ entity.name }}
      </div>
      <div v-if="subtitle" class="font-medium text-mute text-sm lg:text-note">{{ subtitle }}</div>
    </div>

    <div class="flex items-baseline gap-2" :title="egp(entity.deals)">
      <span
        class="font-bold leading-[0.85] tracking-[-0.02em] tabular-nums text-accent-text"
        :class="statSize"
      >
        {{ compact(entity.deals) }}
      </span>
      <span class="font-medium uppercase text-accent-text/65 tracking-[0.16em] text-sm lg:text-label">
        {{ t('card.sales') }}
      </span>
    </div>

    <ProgressTrack :pct="entity.pct" soft tall />

    <div class="font-semibold text-accent-text/85 text-sm lg:text-[clamp(15px,1.9vh,21px)]">
      {{ t('card.ofTarget', { pct: entity.pct, target: compact(entity.target) }) }}
    </div>
  </div>
</template>
