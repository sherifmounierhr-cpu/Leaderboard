<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCountUp } from '@/composables/useCountUp'
import { compact, egp } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'
import ProgressTrack from './ProgressTrack.vue'
import TeamLeads from './TeamLeads.vue'

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
const deals = useCountUp(computed(() => props.entity.deals))
const statSize = computed(() => (props.size === 'hero' ? 'text-stat-hero' : 'text-stat-2'))
</script>

<template>
  <!-- سطح الهوية الغامق: المتصدّر هو العنصر الوحيد الملوَّن بالكامل على الشاشة -->
  <div
    data-surface="dark"
    class="on-brand relative isolate overflow-hidden shrink-0 flex flex-col items-center gap-3.5 lg:gap-[clamp(6px,1.3vh,12px)] [@media(max-height:820px)]:gap-1 [@media(max-height:820px)]:pb-2 rounded-2xl px-6 pb-8 lg:pb-[clamp(12px,2.4vh,28px)] pt-0 lg:px-8 ring-1 ring-inset ring-white/15 shadow-[0_1px_2px_-1px_rgba(10,46,47,0.2),0_26px_50px_-26px_rgba(10,46,47,0.75)]"
  >
    <span class="peaks -z-10" aria-hidden="true" />
    <div
      class="flex items-center gap-2 rounded-b-xl bg-gold px-6 py-2 font-bold tracking-[0.08em] text-[#0a2e2f] text-xs lg:text-[clamp(13px,1.6vh,16px)] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.55)]"
    >
      <iconify-icon icon="mdi:trophy" aria-hidden="true" class="text-base lg:text-lg" />
      {{ ribbon }}
    </div>

    <!-- مع صف القيادة يصغر الشعار قليلاً حتى لا تدفع البطاقة الجدول خارج الشاشة -->
    <Avatar
      :entity="entity"
      :kind="kind"
      size="large"
      class="size-24 rounded-3xl ring-[3px] ring-gold text-3xl shadow-[0_14px_30px_-14px_rgba(0,0,0,0.7)]"
      :class="entity.leads?.length ? 'lg:size-[clamp(72px,11.5vh,140px)]' : 'lg:size-[clamp(72px,11vh,128px)]'"
    />

    <div class="flex flex-col items-center gap-0.5 w-full">
      <div
        class="w-full font-extrabold tracking-[-0.01em] text-center text-strong text-2xl lg:text-[clamp(22px,3.4vh,32px)] text-balance break-words line-clamp-2"
        :title="entity.name"
      >
        {{ entity.name }}
      </div>
      <div v-if="subtitle" class="font-medium text-mute text-sm lg:text-note">{{ subtitle }}</div>
    </div>

    <TeamLeads v-if="kind === 'team'" :leads="entity.leads" :size="size === 'hero' ? 'hero' : 'compact'" />

    <div class="flex items-baseline gap-2" :title="egp(entity.deals)">
      <span
        class="font-extrabold leading-[0.85] [@media(max-height:820px)]:leading-[1.05] tracking-[-0.02em] tabular-nums text-strong"
        :class="statSize"
      >
        {{ compact(deals) }}
      </span>
      <span class="font-semibold uppercase text-accent-text tracking-[0.12em] text-sm lg:text-label">
        {{ t('card.sales') }}
      </span>
    </div>

    <ProgressTrack :pct="entity.pct" soft tall />

    <div class="font-semibold text-mute text-sm lg:text-[clamp(15px,1.9vh,21px)]">
      {{ t('card.ofTarget', { pct: entity.pct, target: compact(entity.target) }) }}
    </div>
  </div>
</template>
