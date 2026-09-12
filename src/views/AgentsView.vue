<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import { isKiosk } from '@/composables/useSettings'
import Avatar from '@/components/Avatar.vue'
import ProgressTrack from '@/components/ProgressTrack.vue'
import RankDelta from '@/components/RankDelta.vue'

const { agents, agentDeltas } = useBoardData()
const { t } = useI18n()

const query = ref('')

/**
 * الترتيب يبقى مرتبطاً بالموضع الأصلي في القائمة، لا بموضعه بعد الفلترة —
 * البحث لا يجب أن يغيّر رقم المركز الذي يراه المستشار.
 */
const ranked = computed(() => agents.value.map((agent, index) => ({ agent, rank: index + 1 })))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return ranked.value
  return ranked.value.filter(
    ({ agent }) =>
      agent.name.toLowerCase().includes(q) || (agent.team ?? '').toLowerCase().includes(q),
  )
})

const GRID =
  'grid-cols-[60px_2fr_1.1fr_78px_88px_1.25fr] gap-4 px-6 2xl:grid-cols-[96px_1.8fr_1fr_120px_120px_1.4fr] 2xl:gap-[22px] 2xl:px-10'
</script>

<template>
  <div class="flex-1 flex flex-col px-4 py-6 sm:px-8 lg:px-16 lg:py-11 min-h-0 gap-4">
    <p class="sr-only" role="status" aria-live="polite">
      <template v-if="agents.length">
        {{ t('a11y.topAgent', { name: agents[0].name, amount: egp(agents[0].deals) }) }}
      </template>
    </p>

    <!-- البحث -->
    <div v-if="agents.length && !isKiosk" class="relative max-w-sm w-full" data-kiosk-hide data-export-hide>
      <iconify-icon
        icon="mdi:magnify"
        aria-hidden="true"
        class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim text-lg"
      />
      <input
        v-model="query"
        type="search"
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.placeholder')"
        class="w-full rounded-lg border border-card-border bg-card ps-10 pe-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </div>

    <div
      v-if="agents.length && !filtered.length"
      class="flex-1 flex items-center justify-center text-center text-mute font-medium"
    >
      {{ t('search.noResults', { q: query }) }}
    </div>

    <!-- الموبايل -->
    <TransitionGroup
      v-if="filtered.length"
      tag="div"
      name="rank"
      role="list"
      class="lg:hidden flex flex-col gap-3"
    >
      <div
        v-for="{ agent, rank } in filtered"
        :key="agent.id"
        role="listitem"
        class="rounded-xl border bg-card p-4 sm:p-5 shadow-[var(--shadow-card)]"
        :class="rank === 1 ? 'border-accent/60 bg-accent/[0.07] ring-1 ring-accent/30' : 'border-card-border'"
      >
        <div class="flex items-center gap-3">
          <div class="w-8 shrink-0 text-center">
            <template v-if="rank === 1">
              <iconify-icon icon="mdi:trophy" aria-hidden="true" class="text-gold text-xl" />
              <span class="sr-only">{{ t('a11y.rank', { n: 1 }) }}</span>
            </template>
            <span v-else class="font-bold tabular-nums text-strong text-xl">{{ rank }}</span>
          </div>

          <Avatar
            :entity="agent"
            kind="agent"
            class="size-12 sm:size-14 rounded-xl shrink-0 text-lg"
            :class="rank === 1 ? 'ring-2 ring-accent/70' : ''"
          />

          <div class="min-w-0 flex-1">
            <div class="font-semibold truncate text-strong text-base sm:text-lg">{{ agent.name }}</div>
            <div class="font-medium truncate text-mute text-xs sm:text-sm">{{ agent.team }}</div>
          </div>

          <RankDelta :delta="agentDeltas.get(agent.id) || 0" class="shrink-0 text-sm" />
        </div>

        <div class="mt-3.5 flex items-center gap-4">
          <div class="text-center" :title="egp(agent.deals)">
            <div class="text-eyebrow font-medium uppercase tracking-[0.08em] text-mute">
              {{ t('card.sales') }}
            </div>
            <div
              class="font-bold tabular-nums text-xl"
              :class="rank === 1 ? 'text-accent-text' : 'text-strong'"
            >{{ compact(agent.deals) }}</div>
          </div>

          <div class="text-center" :title="egp(agent.target)">
            <div class="text-eyebrow font-medium uppercase tracking-[0.08em] text-mute">
              {{ t('card.target') }}
            </div>
            <div class="font-medium tabular-nums text-mute text-lg">{{ compact(agent.target) }}</div>
          </div>

          <div class="flex-1 flex items-center gap-2.5">
            <ProgressTrack :pct="agent.pct" :soft="rank === 1" class="flex-1" />
            <span
              class="w-10 text-end font-semibold tabular-nums text-sm"
              :class="rank === 1 ? 'text-accent-text' : 'text-mute'"
            >{{ agent.pct }}%</span>
          </div>
        </div>
      </div>
    </TransitionGroup>

    <!-- الديسكتوب -->
    <div
      v-if="filtered.length"
      role="table"
      :aria-label="t('a11y.agentStandings')"
      class="hidden lg:flex lg:flex-col lg:flex-1 rounded-xl border border-card-border bg-card overflow-hidden min-h-0 shadow-[var(--shadow-panel)]"
    >
      <div role="rowgroup">
        <div
          role="row"
          class="grid items-center py-5 bg-card-alt border-b border-card-border font-medium uppercase tracking-[0.08em] text-mute text-sm 2xl:text-base whitespace-nowrap"
          :class="GRID"
        >
          <span role="columnheader">{{ t('table.rank') }}</span>
          <span role="columnheader">{{ t('table.agent') }}</span>
          <span role="columnheader">{{ t('table.team') }}</span>
          <span role="columnheader" class="text-center">{{ t('table.sales') }}</span>
          <span role="columnheader" class="text-center">{{ t('table.target') }}</span>
          <span role="columnheader">{{ t('table.progressShort') }}</span>
        </div>
      </div>

      <TransitionGroup role="rowgroup" tag="div" name="rank" data-scroll class="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div
          v-for="{ agent, rank } in filtered"
          :key="agent.id"
          role="row"
          class="grid items-center flex-1 min-h-[5.5rem] 2xl:min-h-[6.5rem] py-2 border-b border-divider last:border-b-0"
          :class="[
            GRID,
            rank === 1
              ? 'bg-accent/[0.06] border-b-0 shadow-[inset_3px_0_0_0_var(--color-accent)]'
              : 'transition-colors duration-150 hover:bg-accent/[0.04] ' + (rank % 2 === 1 ? 'bg-card-alt' : ''),
          ]"
        >
          <div role="cell">
            <div v-if="rank === 1" class="flex items-center gap-1.5 2xl:gap-2">
              <iconify-icon icon="mdi:trophy" aria-hidden="true" class="text-gold text-xl 2xl:text-2xl" />
              <span class="font-bold tabular-nums text-accent-text text-2xl 2xl:text-metric">1</span>
            </div>
            <span v-else class="font-bold tabular-nums text-strong text-2xl 2xl:text-rank">{{ rank }}</span>
          </div>

          <div role="cell" class="flex items-center gap-3 2xl:gap-4 min-w-0">
            <Avatar
              :entity="agent"
              kind="agent"
              class="rounded-xl 2xl:rounded-2xl shrink-0 text-xl"
              :class="rank === 1 ? 'size-14 2xl:size-[72px] ring-2 ring-accent/70' : 'size-14 2xl:size-[66px]'"
            />
            <span class="font-semibold truncate text-strong text-xl 2xl:text-name">{{ agent.name }}</span>
            <RankDelta :delta="agentDeltas.get(agent.id) || 0" class="shrink-0 text-sm 2xl:text-base" />
          </div>

          <span role="cell" class="font-medium truncate text-mute text-base 2xl:text-xl">{{ agent.team }}</span>

          <span
            role="cell"
            :title="egp(agent.deals)"
            class="text-center font-bold tracking-[-0.01em] tabular-nums"
            :class="rank === 1 ? 'text-accent-text text-stat-3-lead' : 'text-strong text-stat-3'"
          >{{ compact(agent.deals) }}</span>

          <span
            role="cell"
            :title="egp(agent.target)"
            class="text-center font-medium tabular-nums text-mute text-lg 2xl:text-metric-sm"
          >{{ compact(agent.target) }}</span>

          <div role="cell" class="flex items-center gap-2.5 2xl:gap-3.5">
            <ProgressTrack :pct="agent.pct" :soft="rank === 1" tall class="flex-1" />
            <span
              class="w-11 2xl:w-[52px] text-end font-semibold tabular-nums text-base 2xl:text-lg"
              :class="rank === 1 ? 'text-accent-text' : 'text-mute'"
            >{{ agent.pct }}%</span>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <div v-if="!agents.length" class="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
      <iconify-icon icon="mdi:account-tie" aria-hidden="true" class="text-dim text-6xl" />
      <p class="m-0 font-semibold text-strong text-2xl">{{ t('empty.agentsTitle') }}</p>
      <p class="m-0 font-medium text-mute text-base max-w-sm">{{ t('empty.agentsBody') }}</p>
    </div>
  </div>
</template>
