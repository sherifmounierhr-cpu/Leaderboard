<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { egp, millions } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import Avatar from '@/components/Avatar.vue'
import ProgressTrack from '@/components/ProgressTrack.vue'
import RankDelta from '@/components/RankDelta.vue'
import LeaderCard from '@/components/LeaderCard.vue'
import PodiumCard from '@/components/PodiumCard.vue'
import TeamRow from '@/components/TeamRow.vue'
import BoardSkeleton from '@/components/BoardSkeleton.vue'

const { teams, teamDeltas, updatedAt } = useBoardData()
const { t } = useI18n()

// عمود المبيعات بـ clamp لنفس سبب شاشة المستشارين: «مليون» بالعربية أعرض من «M»
const GRID =
  'grid-cols-[56px_1.9fr_clamp(80px,5vw,120px)_clamp(140px,11vw,195px)_1.45fr] gap-4 px-6 2xl:grid-cols-[96px_1.9fr_clamp(80px,5vw,120px)_clamp(140px,11vw,195px)_1.6fr] 2xl:gap-[22px] 2xl:px-10'
</script>

<template>
  <div
    class="flex-1 flex flex-col justify-center gap-6 lg:gap-[clamp(12px,2.2vh,28px)] px-4 py-6 sm:px-8 lg:px-8 2xl:px-16 lg:pt-[clamp(12px,2.2vh,28px)] lg:pb-[clamp(14px,2.6vh,32px)] min-h-0"
  >
    <p class="sr-only" role="status" aria-live="polite">
      <template v-if="teams.length">
        {{ t('a11y.teamLeader', { name: teams[0].name, amount: egp(teams[0].deals) }) }}
      </template>
    </p>

    <template v-if="teams.length">
      <!-- الموبايل: البطاقة الأولى ثم قائمة -->
      <div class="md:hidden flex flex-col gap-5">
        <LeaderCard :entity="teams[0]" kind="team" class="rise" />
        <TransitionGroup
          v-if="teams.length > 1"
          tag="div"
          name="rank"
          role="table"
          :aria-label="t('a11y.teamStandingsRest', { from: 2 })"
          class="rise rounded-2xl border border-card-border bg-card overflow-hidden shadow-[var(--shadow-panel)]"
          style="--i: 1"
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
      <div class="hidden md:flex md:flex-col lg:flex-1 lg:justify-center gap-6 lg:gap-[clamp(12px,2.2vh,28px)] min-h-0">
        <!--
          منصة تتويج فعلية: كل بطاقة واقفة على درجة، وارتفاع الدرجة هو الترتيب.
          الدخول بترتيب إعلان النتائج: الثالث ثم الثاني ثم الأول.
        -->
        <div class="grid grid-cols-[1fr_1.22fr_1fr] gap-5 lg:gap-7 items-end">
          <div v-if="teams[1]" class="rise flex flex-col" style="--i: 2">
            <PodiumCard :team="teams[1]" :rank="2" class="rounded-b-none" />
            <div class="plinth plinth-2 h-9 lg:h-[clamp(30px,4.4vh,52px)] text-2xl lg:text-[clamp(22px,3.2vh,36px)]" aria-hidden="true">2</div>
          </div>
          <div v-else aria-hidden="true" />
          <div class="rise flex flex-col" style="--i: 3">
            <LeaderCard :entity="teams[0]" kind="team" class="rounded-b-none" />
            <div class="plinth plinth-1 h-14 lg:h-[clamp(44px,6.6vh,78px)] text-4xl lg:text-[clamp(30px,4.8vh,54px)]" aria-hidden="true">1</div>
          </div>
          <div v-if="teams[2]" class="rise flex flex-col" style="--i: 1">
            <PodiumCard :team="teams[2]" :rank="3" class="rounded-b-none" />
            <div class="plinth plinth-3 h-6 lg:h-[clamp(20px,2.8vh,34px)] text-lg lg:text-[clamp(16px,2.2vh,24px)]" aria-hidden="true">3</div>
          </div>
          <div v-else aria-hidden="true" />
        </div>

        <div
          v-if="teams.length > 3"
          role="table"
          :aria-label="t('a11y.teamStandingsRest', { from: 4 })"
          class="rise lg:flex-[0_1_auto] flex flex-col rounded-2xl border border-card-border bg-card overflow-hidden min-h-0 shadow-[var(--shadow-panel)]"
          style="--i: 4"
        >
          <div role="rowgroup">
            <div
              role="row"
              class="grid items-center py-2.5 2xl:py-3 [@media(max-height:820px)]:py-1.5 bg-card-alt border-b border-card-border font-semibold tracking-[0.04em] text-mute text-sm 2xl:text-base whitespace-nowrap"
              :class="GRID"
            >
              <span role="columnheader">{{ t('table.rank') }}</span>
              <span role="columnheader">{{ t('table.team') }}</span>
              <span role="columnheader" class="text-center">{{ t('table.members') }}</span>
              <span role="columnheader" class="text-center">{{ t('table.salesM') }}</span>
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
              class="grid items-center shrink-0 h-[clamp(3.5rem,8vh,5.75rem)] [@media(max-height:820px)]:h-12 border-b border-divider last:border-b-0 transition-colors duration-200 hover:bg-accent/[0.06]"
              :class="GRID"
            >
              <span role="cell" :aria-label="t('a11y.rank', { n: i + 4 })">
                <span class="inline-flex items-center justify-center rounded-xl bg-strong/[0.06] font-display font-bold tabular-nums text-strong size-10 text-xl 2xl:size-[clamp(44px,5vh,56px)] 2xl:text-2xl">{{ i + 4 }}</span>
              </span>

              <div role="cell" class="flex items-center gap-3 2xl:gap-4 min-w-0">
                <Avatar :entity="team" kind="team" class="size-12 [@media(max-height:820px)]:size-10 2xl:size-[clamp(56px,6.2vh,74px)] rounded-xl 2xl:rounded-2xl shrink-0" />
                <span class="font-semibold truncate text-strong text-xl 2xl:text-name">{{ team.name }}</span>
                <RankDelta :delta="teamDeltas.get(team.id) || 0" class="shrink-0 text-base 2xl:text-lg" />
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
              >{{ millions(team.deals) }}</span>

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

    <!-- قبل أول تحميل ناجح: هيكل اللوحة، لا رسالة «لا توجد فرق» -->
    <BoardSkeleton v-else-if="!updatedAt" podium />

    <div v-else class="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
      <iconify-icon icon="mdi:office-building-outline" aria-hidden="true" class="text-dim text-6xl" />
      <p class="m-0 font-semibold text-strong text-2xl">{{ t('empty.teamsTitle') }}</p>
      <p class="m-0 font-medium text-mute text-base max-w-sm">{{ t('empty.teamsBody') }}</p>
    </div>
  </div>
</template>
