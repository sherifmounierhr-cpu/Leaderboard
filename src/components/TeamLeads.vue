<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TeamLead } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'

/**
 * مديرو الفريق ومشرفوه تحت اسم الفريق، مجمّعين بالدور: صور متراكبة + الأسماء.
 * العدد مفتوح، فالصور تُقصر على أول ثلاثة و«+N» — البطاقة لا تطول مع كل اسم.
 */
const props = withDefaults(defineProps<{ leads?: TeamLead[]; size?: 'hero' | 'compact' }>(), {
  leads: () => [],
  size: 'compact',
})

const MAX_FACES = 3

const { t, locale } = useI18n()

const groups = computed(() =>
  (['manager', 'supervisor'] as const)
    .map((role) => {
      const people = props.leads.filter((l) => l.role === role)
      return {
        role,
        people,
        faces: people.slice(0, MAX_FACES),
        extra: Math.max(people.length - MAX_FACES, 0),
        label: t(people.length > 1 ? `card.${role}s` : `card.${role}`),
        names: people.map((p) => p.name).join(locale.value === 'ar' ? '، ' : ', '),
      }
    })
    .filter((g) => g.people.length),
)

const hero = computed(() => props.size === 'hero')
</script>

<template>
  <ul
    v-if="groups.length"
    class="m-0 p-0 list-none flex flex-wrap items-center justify-center w-full"
    :class="hero ? 'gap-x-[clamp(16px,2.2vw,36px)] gap-y-2' : 'gap-x-[clamp(12px,1.5vw,24px)] gap-y-1.5'"
  >
    <li v-for="group in groups" :key="group.role" class="flex items-center gap-2 min-w-0 max-w-full">
      <!-- space-x في Tailwind 4 منطقي (margin-inline) فيتراكب صحيحاً في RTL بلا عكس -->
      <div class="flex shrink-0 -space-x-2.5">
        <Avatar
          v-for="person in group.faces"
          :key="person.id"
          :entity="{ id: person.id, name: person.name, photo: person.photo, deals: 0, target: 0, pct: 0 }"
          kind="agent"
          class="rounded-full ring-2 ring-card"
          :class="hero
            ? 'size-10 lg:size-[clamp(34px,4.2vh,48px)] text-sm'
            : 'size-9 lg:size-[clamp(28px,3.4vh,40px)] text-xs'"
          :title="person.name"
        />
        <span
          v-if="group.extra"
          class="relative flex items-center justify-center rounded-full bg-avatar ring-2 ring-card font-bold text-avatar-text tabular-nums"
          :class="hero
            ? 'size-10 lg:size-[clamp(34px,4.2vh,48px)] text-xs lg:text-sm'
            : 'size-9 lg:size-[clamp(28px,3.4vh,40px)] text-[11px] lg:text-xs'"
        >+{{ group.extra }}</span>
      </div>
      <div class="flex flex-col items-start min-w-0 leading-tight text-start">
        <span
          class="font-medium text-mute whitespace-nowrap"
          :class="hero ? 'text-caption lg:text-[clamp(12px,1.4vh,16px)]' : 'text-[11px] lg:text-[clamp(11px,1.25vh,14px)]'"
        >{{ group.label }}</span>
        <span
          class="font-semibold text-strong truncate"
          :class="hero
            ? 'max-w-[24ch] text-sm lg:text-[clamp(14px,1.8vh,20px)]'
            : 'max-w-[18ch] text-caption lg:text-[clamp(13px,1.55vh,17px)]'"
          :title="group.names"
        >{{ group.names }}</span>
      </div>
    </li>
  </ul>
</template>
