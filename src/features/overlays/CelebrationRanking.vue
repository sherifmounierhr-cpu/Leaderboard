<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { compact as compactNumber } from '@/lib/format'
import type { LocaleName } from '@/lib/types'

/**
 * جدول الترتيب بعد كل قسم في احتفال نهاية الربع: كروت كبيرة للفرق، وصفوف
 * بصورة مقرّبة للأفراد. عرض بس — الصفوف جاية من CelebrationOverlay.
 */
export interface RankingRow { id: string; rank: number; name: string; photo: string; deals: number; target: number; pct: number }

const props = defineProps<{
  section: 'team' | 'agent'
  rows: RankingRow[]
  /** لغة الاحتفال (قد تختلف عن لغة اللوحة). */
  lang: LocaleName
  /** إخفاء مبالغ الأفراد (إعداد من الإدارة) — الفرق بتفضل ظاهرة. */
  hideAmounts: boolean
}>()

const { t: translate } = useI18n()
const t = (key: string) => translate(key, {}, { locale: props.lang })
const compact = (value: unknown) => compactNumber(value, props.lang)
</script>

<template>
  <div class="relative flex h-full w-full flex-col items-center gap-[clamp(14px,3vh,36px)] px-[4vw] py-[5vh] portrait:pt-[10vh] text-white">
    <h2 class="rise m-0 flex items-center gap-[0.45em] font-display font-bold drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] text-[clamp(26px,min(5.4vh,3.24vw),68px)]">
      <iconify-icon icon="mdi:podium-gold" aria-hidden="true" class="text-gold" />
      {{ t(section === 'team' ? 'celebrate.rankingTeamTitle' : 'celebrate.rankingAgentTitle') }}
    </h2>

    <!-- الفرق قليلة: كروت كبيرة صورة الفريق فيها واضحة بعرضها، مش دواير صغيرة -->
    <div v-if="section === 'team'" class="flex w-full flex-1 flex-wrap content-center items-center justify-center gap-[clamp(14px,2vw,36px)]">
      <article
        v-for="row in rows"
        :key="row.id"
        class="rise flex flex-col overflow-hidden rounded-[clamp(14px,2vh,26px)] bg-[#061617]/70 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/15 w-[var(--w)] portrait:w-[min(43vw,25vh)]"
        :class="row.rank === 1 ? 'ring-[3px] ring-gold scale-[1.04]' : ''"
        :style="{ '--i': row.rank + 1, '--w': `min(34rem, 52vh, ${Math.floor(86 / Math.min(Math.max(rows.length, 1), 4))}vw)` }"
      >
        <!-- صور الفرق بوسترات طولية: إطار طولي يعرض البوستر كله بدل ما يتقص -->
        <div class="relative aspect-[3/4] overflow-hidden bg-avatar">
          <img v-if="row.photo" :src="row.photo" alt="" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-cover object-top" />
          <span
            class="absolute top-[0.5em] start-[0.5em] flex items-center gap-[0.25em] rounded-full bg-gold px-[0.6em] py-[0.1em] font-display font-bold text-header shadow-[0_8px_20px_-6px_rgba(0,0,0,0.7)] text-[clamp(20px,min(4vh,2.4vw),52px)]"
          >
            <iconify-icon v-if="row.rank === 1" icon="mdi:crown" aria-hidden="true" />
            {{ row.rank }}
          </span>
        </div>
        <div class="flex items-baseline justify-between gap-[0.6em] px-[0.9em] py-[0.6em] text-[clamp(16px,min(3vh,1.8vw),38px)]">
          <span class="min-w-0 truncate font-display font-bold">{{ row.name }}</span>
          <span class="shrink-0 font-display font-bold tabular-nums text-gold">{{ compact(row.deals) }}</span>
        </div>
      </article>
    </div>

    <!-- الأفراد: اللي حققوا مبيعات بس، صفوف بصورة مقرّبة على الوش -->
    <ol
      v-else
      class="m-0 grid w-full flex-1 list-none content-center gap-[clamp(8px,1.4vh,18px)] p-0"
      :class="rows.length > 10 ? 'grid-cols-3 portrait:grid-cols-2' : 'grid-cols-2 portrait:grid-cols-1'"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="rise flex items-center gap-[0.75em] rounded-[clamp(10px,1.6vh,18px)] px-[0.8em] py-[0.5em]"
        :class="[
          row.rank <= 3 ? 'bg-[#061617]/70 ring-1 ring-gold/70' : 'bg-[#061617]/50 ring-1 ring-white/10',
          rows.length <= 10 ? 'text-[clamp(17px,min(3vh,1.8vw),36px)]' : 'text-[clamp(15px,min(2.5vh,1.5vw),30px)]',
        ]"
        :style="{ '--i': Math.min(row.rank, 14) }"
      >
        <span
          class="flex size-[1.9em] shrink-0 items-center justify-center rounded-full font-display font-bold"
          :class="row.rank <= 3 ? 'bg-gold text-header' : 'bg-white/12 text-white'"
        >{{ row.rank }}</span>
        <span
          class="ranking-face size-[2.6em] shrink-0 rounded-[0.6em] bg-avatar ring-1 ring-white/20"
          :style="row.photo ? { backgroundImage: `url('${row.photo}')` } : undefined"
        />
        <span class="min-w-0 flex-1 truncate font-bold">{{ row.name }}</span>
        <span v-if="!hideAmounts" class="shrink-0 font-bold tabular-nums text-gold">{{ compact(row.deals) }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* صور الموظفين بوسترات والوش في أعلى تلتها — نقرّب عليه بدل البوستر كله */
.ranking-face {
  background-size: 175%;
  background-position: 50% 12%;
  background-repeat: no-repeat;
}
</style>
