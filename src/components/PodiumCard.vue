<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'
import ProgressTrack from './ProgressTrack.vue'
import TeamLeads from './TeamLeads.vue'

defineProps<{ team: BoardEntity; rank: number }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="flex flex-col items-center gap-3.5 lg:gap-[clamp(6px,1.3vh,12px)] rounded-xl border border-card-border bg-card px-6 py-7 lg:px-7 lg:py-[clamp(8px,1.6vh,28px)] shadow-[var(--shadow-podium)]"
  >
    <div class="font-semibold tracking-[0.02em] text-mute text-lg lg:text-metric-sm">
      <span class="text-dim">#</span>{{ rank }}
    </div>

    <Avatar
      :entity="team"
      kind="team"
      class="size-20 rounded-2xl ring-1 ring-card-border text-2xl"
      :class="team.leads?.length ? 'lg:size-[clamp(48px,6.5vh,80px)]' : 'lg:size-[clamp(60px,9vh,96px)]'"
    />

    <div
      class="w-full font-semibold tracking-[-0.01em] text-center text-strong text-lg lg:text-[clamp(18px,2.7vh,24px)] text-balance break-words line-clamp-2"
      :title="team.name"
    >
      {{ team.name }}
    </div>

    <TeamLeads :leads="team.leads" />

    <div class="flex items-baseline gap-2" :title="egp(team.deals)">
      <span class="font-bold leading-[0.9] tracking-[-0.02em] tabular-nums text-strong text-stat-2">
        {{ compact(team.deals) }}
      </span>
      <span class="font-medium uppercase text-mute tracking-[0.14em] text-xs lg:text-note">
        {{ t('card.sales') }}
      </span>
    </div>

    <ProgressTrack :pct="team.pct" />

    <div class="font-medium text-mute text-caption lg:text-[clamp(14px,1.7vh,19px)]">
      {{ t('card.ofTarget', { pct: team.pct, target: compact(team.target) }) }}
    </div>
  </div>
</template>
