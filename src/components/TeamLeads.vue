<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TeamLead } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'

/** مدير الفريق ومشرفه تحت اسم الفريق — لا شيء يُرسم لو الخانتان فارغتان. */
withDefaults(defineProps<{ leads?: TeamLead[]; size?: 'hero' | 'compact' }>(), {
  leads: () => [],
  size: 'compact',
})

const { t } = useI18n()
</script>

<template>
  <ul
    v-if="leads.length"
    class="m-0 p-0 list-none flex flex-wrap items-center justify-center w-full"
    :class="size === 'hero' ? 'gap-x-[clamp(14px,2vw,32px)] gap-y-2' : 'gap-x-[clamp(10px,1.4vw,22px)] gap-y-1.5'"
  >
    <li v-for="lead in leads" :key="lead.id" class="flex items-center gap-2 min-w-0">
      <Avatar
        :entity="{ id: lead.id, name: lead.name, photo: lead.photo, deals: 0, target: 0, pct: 0 }"
        kind="agent"
        class="shrink-0 rounded-full ring-1 ring-card-border"
        :class="size === 'hero'
          ? 'size-10 lg:size-[clamp(36px,4.4vh,50px)] text-sm'
          : 'size-9 lg:size-[clamp(30px,3.6vh,42px)] text-xs'"
      />
      <div class="flex flex-col items-start min-w-0 leading-tight text-start">
        <span
          class="font-medium text-mute whitespace-nowrap"
          :class="size === 'hero' ? 'text-caption lg:text-[clamp(12px,1.4vh,16px)]' : 'text-[11px] lg:text-[clamp(11px,1.25vh,14px)]'"
        >{{ t(`card.${lead.role}`) }}</span>
        <span
          class="font-semibold text-strong truncate max-w-[14ch]"
          :class="size === 'hero' ? 'text-sm lg:text-[clamp(14px,1.8vh,20px)]' : 'text-caption lg:text-[clamp(13px,1.55vh,17px)]'"
          :title="lead.name"
        >{{ lead.name }}</span>
      </div>
    </li>
  </ul>
</template>
