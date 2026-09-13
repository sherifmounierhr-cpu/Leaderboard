<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import Avatar from '@/components/Avatar.vue'
import ProgressTrack from '@/components/ProgressTrack.vue'
import RankDelta from '@/components/RankDelta.vue'
import LeaderCard from '@/components/LeaderCard.vue'
import PodiumCard from '@/components/PodiumCard.vue'
import TeamRow from '@/components/TeamRow.vue'

const { teams, teamDeltas } = useBoardData()
const { t } = useI18n()

// عمود المبيعات بـ clamp لنفس سبب شاشة المستشارين: «مليون» بالعربية أعرض من «M»
const GRID =
  'grid-cols-[56px_1.9fr_clamp(80px,5vw,120px)_clamp(140px,11vw,195px)_1.45fr] gap-4 px-6 2xl:grid-cols-[96px_1.9fr_clamp(80px,5vw,120px)_clamp(140px,11vw,195px)_1.6fr] 2xl:gap-[22px] 2xl:px-10'
</script>

<template>
  <div
    class="flex-1 flex flex-col justify-center gap-6 lg:gap-[clamp(16px,3vh,36px)] px-4 py-6 sm:px-8 lg:px-16 lg:py-[clamp(20px,4vh,44px)] min-h-0"
  >
    <p class="sr-only" role="status" aria-live="polite">
      <template v-if="teams.length">
        {{ t('a11y.teamLeader', { name: teams[0].name, amount: egp(teams[0].deals) }) }}
      </template>
    </p>

    <template v-if="teams.length">
      <!-- الموبايل: البطاقة الأولى ثم قائمة -->
      <div class="md:hidden flex flex-col gap-5">
        <LeaderCard :team="teams[0]" />
        <TransitionGroup
          v-if="teams.length > 1"
          tag="div"
          name="rank"
          role="table"
          :aria-label="t('a11y.teamStandingsRest', { from: 2 })"
          class="rounded-xl border border-card-border bg-card overflow-hidden shadow-[var(--shadow-panel)]"
        >
          <TeamRow
            v-for="(team, i) in teams.slice(1)"
            :key="team.id"
            :team="team"
            :rank="i + 2"
            :alt="i % 2 === 1"
            :delta="teamDeltas.get(team.id) || 0"
          />
        </TransitionGroup>
      </div>

      <!-- الديسكتوب: منصة التتويج ثم جدول -->
      <div class="hidden md:flex md:flex-col lg:flex-1 gap-6 lg:gap-[clamp(16px,3vh,36px)] min-h-0">
        <div class="grid grid-cols-[1fr_1.22fr_1fr] gap-5 lg:gap-7 items-end">
          <PodiumCard v-if="teams[1]" :team="teams[1]" :rank="2" />
          <div v-else aria-hidden="true" />
          <LeaderCard :team="teams[0]" />
          <PodiumCard v-if="teams[2]" :team="teams[2]" :rank="3" />
          <div v-else aria-hidden="true" />
        </div>

        <div
          v-if="teams.length > 3"
          role="table"
          :aria-label="t('a11y.teamStandingsRest', { from: 4 })"
          class="lg:flex-1 flex flex-col rounded-xl border border-card-border bg-card overflow-hidden min-h-0 shadow-[var(--shadow-panel)]"
        >
          <div role="rowgroup">
            <div
              role="row"
              class="grid items-center py-5 bg-card-alt border-b border-card-border font-medium uppercase tracking-[0.08em] text-mute text-sm 2xl:text-base whitespace-nowrap"
              :class="GRID"
            >
              <span role="columnheader">{{ t('table.rank') }}</span>
              <span role="columnheader">{{ t('table.team') }}</span>
              <span role="columnheader" class="text-center">{{ t('table.members') }}</span>
              <span role="columnheader" class="text-center">{{ t('table.sales') }}</span>
              <span role="columnheader">{{ t('table.progress') }}</span>
            </div>
          </div>

          <TransitionGroup
            role="rowgroup"
            tag="div"
            name="rank"
            data-scroll class="flex-1 min-h-0 flex flex-col overflow-y-auto"
          >
            <div
              v-for="(team, i) in teams.slice(3)"
              :key="team.id"
              role="row"
              class="grid items-center flex-1 min-h-[4.5rem] border-b border-divider last:border-b-0 transition-colors duration-150 hover:bg-accent/[0.04]"
              :class="[GRID, i % 2 === 0 ? 'bg-card-alt' : '']"
            >
              <span
                role="cell"
                :aria-label="t('a11y.rank', { n: i + 4 })"
                class="font-bold tabular-nums text-strong text-2xl 2xl:text-rank"
              >{{ i + 4 }}</span>

              <div role="cell" class="flex items-center gap-3 2xl:gap-4 min-w-0">
                <Avatar :entity="team" kind="team" class="size-14 2xl:size-[66px] rounded-xl 2xl:rounded-2xl shrink-0" />
                <span class="font-semibold truncate text-strong text-xl 2xl:text-name">{{ team.name }}</span>
                <RankDelta :delta="teamDeltas.get(team.id) || 0" class="shrink-0 text-sm 2xl:text-base" />
              </div>

              <span
                role="cell"
                :aria-label="t('a11y.members', { n: team.members ?? 0 })"
                class="text-center font-medium tabular-nums text-mute text-lg 2xl:text-metric-sm"
              >{{ team.members }}</span>

              <span
                role="cell"
                :aria-label="t('a11y.salesAmount', { amount: egp(team.deals) })"
                :title="egp(team.deals)"
                class="text-center font-bold tracking-[-0.01em] tabular-nums text-strong text-stat-3"
              >{{ compact(team.deals) }}</span>

              <div
                role="cell"
                :aria-label="t('a11y.pctOfTarget', { pct: team.pct })"
                class="flex items-center gap-2.5 2xl:gap-3.5"
              >
                <ProgressTrack :pct="team.pct" tall class="flex-1" />
                <span class="w-11 2xl:w-[52px] text-end font-semibold tabular-nums text-mute text-base 2xl:text-lg">
                  {{ team.pct }}%
                </span>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </template>

    <div v-else class="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
      <iconify-icon icon="mdi:office-building-outline" aria-hidden="true" class="text-dim text-6xl" />
      <p class="m-0 font-semibold text-strong text-2xl">{{ t('empty.teamsTitle') }}</p>
      <p class="m-0 font-medium text-mute text-base max-w-sm">{{ t('empty.teamsBody') }}</p>
    </div>
  </div>
</template>
