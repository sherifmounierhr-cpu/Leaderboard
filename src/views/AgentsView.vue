<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp, millions } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import { isKiosk } from '@/composables/useSettings'
import Avatar from '@/components/Avatar.vue'
import ProgressTrack from '@/components/ProgressTrack.vue'
import RankDelta from '@/components/RankDelta.vue'
import LeaderCard from '@/components/LeaderCard.vue'
import BoardSkeleton from '@/components/BoardSkeleton.vue'
import LatestDeals from '@/components/LatestDeals.vue'

const { agents, agentDeltas, updatedAt } = useBoardData()
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

const searching = computed(() => query.value.trim().length > 0)

/**
 * المتصدّر يخرج من الجدول إلى بطاقة خاصة — نفس منطق منصّة التتويج في شاشة
 * الفروع. أثناء البحث تُخفى البطاقة ويعود الجدول كاملاً، وإلا لاختفى المتصدّر
 * من نتائج البحث عن اسمه.
 */
const leader = computed(() => (searching.value ? null : (ranked.value[0] ?? null)))
const listed = computed(() => (searching.value ? filtered.value : filtered.value.slice(1)))

/**
 * عمودا المبيعات والمستهدف بـ clamp لا بعرض ثابت: `compact` بالعربية يكتب
 * «4.6 مليون» بدل «4.6M»، فالنص أعرض بأضعاف وكان يفيض على العمود المجاور.
 * الحد الأدنى يتبع أكبر خط ممكن، والـ vw يكبر مع الشاشة مثل حجم الخط نفسه.
 */
/** الثاني والثالث بلون ميداليتهم؛ الأول له بطاقته الخاصة. */
const MEDAL: Record<number, string> = {
  2: 'bg-silver/18 text-silver ring-1 ring-silver/40',
  3: 'bg-bronze/18 text-bronze ring-1 ring-bronze/40',
}

const GRID =
  'grid-cols-[52px_2.6fr_0.9fr_clamp(112px,9vw,205px)_clamp(116px,9vw,160px)_0.8fr] gap-3 px-5 2xl:grid-cols-[96px_2fr_0.85fr_clamp(125px,12vw,205px)_clamp(120px,8vw,160px)_1.35fr] 2xl:gap-[22px] 2xl:px-10'
</script>

<template>
  <div class="flex-1 flex flex-col px-4 py-6 sm:px-8 lg:px-8 2xl:px-16 lg:pt-[clamp(12px,2.2vh,28px)] lg:pb-[clamp(16px,3vh,44px)] min-h-0 gap-4">
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
        class="w-full min-h-11 rounded-xl border border-card-border bg-card ps-10 pe-3 py-2.5 text-base sm:text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </div>

    <div
      v-if="agents.length && !filtered.length"
      class="flex-1 flex items-center justify-center text-center text-mute font-medium"
    >
      {{ t('search.noResults', { q: query }) }}
    </div>

    <!-- المتصدّر في بطاقة خاصة، وبجانب الجدول على الشاشات الكبيرة حتى لا يأكل ارتفاعاً -->
    <div
      v-if="filtered.length"
      class="flex-1 min-h-0 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(250px,300px)_1fr] lg:gap-5 2xl:gap-6 2xl:grid-cols-[minmax(320px,400px)_1fr]"
    >
      <div v-if="leader" class="flex flex-col gap-4 lg:gap-[clamp(10px,1.8vh,20px)] min-h-0">
        <LeaderCard
          class="rise"
          :entity="leader.agent"
          kind="agent"
          size="compact"
          :label="t('spotlight.topAgent')"
          :subtitle="leader.agent.team || undefined"
        />
        <!-- كانت مساحة فاضية تحت بطاقة المتصدّر على الشاشات الكبيرة -->
        <LatestDeals class="rise hidden lg:flex" style="--i: 2" :limit="5" />
      </div>

      <div class="flex flex-col min-h-0">
    <!-- الموبايل -->
    <TransitionGroup
      tag="div"
      name="rank"
      role="list"
      class="lg:hidden flex flex-col gap-3"
    >
      <div
        v-for="{ agent, rank } in listed"
        :key="agent.id"
        role="listitem"
        class="rise rounded-2xl border bg-card p-4 sm:p-5 shadow-[var(--shadow-card)]"
        :class="rank === 1 ? 'border-accent/60 bg-accent/[0.07] ring-1 ring-accent/30' : 'border-card-border'"
        :style="{ '--i': Math.min(rank, 8) }"
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
            <div class="font-semibold leading-tight text-strong text-base sm:text-lg line-clamp-2 break-words">{{ agent.name }}</div>
            <div class="font-medium truncate text-mute text-xs sm:text-sm">{{ agent.team }}</div>
          </div>

          <RankDelta :delta="agentDeltas.get(agent.id) || 0" class="shrink-0 text-sm" />
        </div>

        <div class="mt-3.5 flex items-center gap-4">
          <div class="text-center" :title="egp(agent.deals)">
            <div class="text-xs font-medium text-mute">
              {{ t('card.sales') }}
            </div>
            <div
              class="font-bold tabular-nums text-xl"
              :class="rank === 1 ? 'text-accent-text' : 'text-strong'"
            >{{ compact(agent.deals) }}</div>
          </div>

          <div class="text-center" :title="egp(agent.target)">
            <div class="text-xs font-medium text-mute">
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
      role="table"
      :aria-label="t('a11y.agentStandings')"
      class="rise hidden lg:flex lg:flex-col lg:flex-1 rounded-2xl border border-card-border bg-card overflow-hidden min-h-0 shadow-[var(--shadow-panel)]"
      style="--i: 1"
    >
      <div role="rowgroup">
        <div
          role="row"
          class="grid items-center py-3 2xl:py-4 bg-card-alt border-b border-card-border font-semibold tracking-[0.04em] text-mute text-sm 2xl:text-base whitespace-nowrap"
          :class="GRID"
        >
          <span role="columnheader">{{ t('table.rank') }}</span>
          <span role="columnheader">{{ t('table.agent') }}</span>
          <span role="columnheader">{{ t('table.team') }}</span>
          <span role="columnheader" class="text-center">{{ t('table.salesM') }}</span>
          <span role="columnheader" class="text-center">{{ t('table.targetM') }}</span>
          <span role="columnheader">{{ t('table.progressShort') }}</span>
        </div>
      </div>

      <TransitionGroup role="rowgroup" tag="div" name="rank" data-scroll class="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <div
          v-for="{ agent, rank } in listed"
          :key="agent.id"
          role="row"
          class="grid items-center flex-1 min-h-[clamp(3.75rem,7.5vh,5.5rem)] 2xl:min-h-[clamp(4rem,8.5vh,6.5rem)] py-2 border-b border-divider last:border-b-0"
          :class="[
            GRID,
            rank === 1
              ? 'bg-accent/[0.06] border-b-0 shadow-[inset_3px_0_0_0_var(--color-accent)]'
              : 'transition-colors duration-200 hover:bg-accent/[0.06]',
          ]"
        >
          <div role="cell">
            <div v-if="rank === 1" class="flex items-center gap-1.5 2xl:gap-2">
              <iconify-icon icon="mdi:trophy" aria-hidden="true" class="text-gold text-xl 2xl:text-2xl" />
              <span class="font-bold tabular-nums text-accent-text text-2xl 2xl:text-metric">1</span>
            </div>
            <span
              v-else
              class="inline-flex items-center justify-center rounded-xl font-display font-bold tabular-nums size-10 text-xl 2xl:size-[clamp(44px,5vh,56px)] 2xl:text-2xl"
              :class="MEDAL[rank] ?? 'bg-strong/[0.06] text-strong'"
            >{{ rank }}</span>
          </div>

          <div role="cell" class="flex items-center gap-3 2xl:gap-4 min-w-0">
            <Avatar
              :entity="agent"
              kind="agent"
              class="rounded-xl 2xl:rounded-2xl shrink-0 text-xl"
              :class="rank === 1 ? 'size-14 2xl:size-[72px] ring-2 ring-accent/70' : 'size-14 2xl:size-[66px]'"
            />
            <span class="min-w-0 font-semibold leading-tight text-strong text-lg xl:text-xl 2xl:text-name line-clamp-2 break-words" :title="agent.name">{{ agent.name }}</span>
            <RankDelta :delta="agentDeltas.get(agent.id) || 0" class="shrink-0 text-base 2xl:text-lg" />
          </div>

          <span role="cell" class="font-medium truncate text-mute text-base 2xl:text-xl">{{ agent.team }}</span>

          <span
            role="cell"
            :title="egp(agent.deals)"
            class="text-center font-bold tracking-[-0.01em] tabular-nums"
            :class="rank === 1 ? 'text-accent-text text-stat-3-lead' : 'text-strong text-stat-3'"
          >{{ millions(agent.deals) }}</span>

          <span
            role="cell"
            :title="egp(agent.target)"
            class="text-center font-medium tabular-nums text-mute text-lg 2xl:text-metric-sm"
          >{{ millions(agent.target) }}</span>

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
      </div>
    </div>

    <BoardSkeleton v-if="!agents.length && !updatedAt" />

    <div v-else-if="!agents.length" class="flex-1 flex flex-col items-center justify-center text-center gap-4 py-16">
      <iconify-icon icon="mdi:account-tie" aria-hidden="true" class="text-dim text-6xl" />
      <p class="m-0 font-semibold text-strong text-2xl">{{ t('empty.agentsTitle') }}</p>
      <p class="m-0 font-medium text-mute text-base max-w-sm">{{ t('empty.agentsBody') }}</p>
    </div>
  </div>
</template>
