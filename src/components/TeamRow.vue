<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'
import ProgressTrack from './ProgressTrack.vue'
import RankDelta from './RankDelta.vue'

withDefaults(
  defineProps<{ team: BoardEntity; rank: number; alt?: boolean; delta?: number }>(),
  { alt: false, delta: 0 },
)
const { t } = useI18n()
</script>

<template>
  <div
    role="row"
    class="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 lg:px-9 py-3.5 lg:py-0 lg:flex-1 min-h-[3.5rem] border-b border-divider last:border-b-0"
    :class="alt ? 'bg-card-alt' : ''"
  >
    <span
      role="cell"
      :aria-label="t('a11y.rank', { n: rank })"
      class="w-6 sm:w-8 lg:w-12 shrink-0 font-bold tabular-nums text-strong text-lg sm:text-2xl lg:text-rank"
    >{{ rank }}</span>

    <div role="cell" class="flex items-center gap-3 lg:gap-4 min-w-0 flex-1 md:flex-none md:w-56 lg:w-64 xl:w-72">
      <Avatar :entity="team" kind="team" class="size-10 sm:size-12 lg:size-[68px] rounded-lg lg:rounded-2xl" />
      <span class="font-semibold truncate text-strong text-base sm:text-xl lg:text-name">{{ team.name }}</span>
      <RankDelta :delta="delta" class="shrink-0 text-xs sm:text-sm lg:text-base" />
    </div>

    <span
      role="cell"
      :aria-label="t('a11y.members', { n: team.members ?? 0 })"
      class="hidden md:block w-16 text-center font-medium tabular-nums text-mute text-lg lg:text-metric-sm"
    >{{ team.members }}</span>

    <div
      role="cell"
      :aria-label="t('a11y.salesAmount', { amount: egp(team.deals) })"
      :title="egp(team.deals)"
      class="w-11 lg:w-20 shrink-0 flex flex-col items-center leading-tight"
    >
      <span class="font-bold tabular-nums text-strong text-lg sm:text-2xl lg:text-metric">{{ compact(team.deals) }}</span>
      <span class="sm:hidden font-semibold tabular-nums text-mute text-xs">{{ team.pct }}%</span>
    </div>

    <div
      role="cell"
      :aria-label="t('a11y.pctOfTarget', { pct: team.pct })"
      class="hidden sm:flex items-center gap-3 lg:gap-4 w-40 md:w-auto md:flex-1 md:min-w-[14rem] lg:min-w-[18rem]"
    >
      <ProgressTrack :pct="team.pct" tall class="flex-1" />
      <span
        class="w-11 lg:w-[54px] text-end font-semibold tabular-nums text-mute text-sm lg:text-lg"
        aria-hidden="true"
      >{{ team.pct }}%</span>
    </div>
  </div>
</template>
