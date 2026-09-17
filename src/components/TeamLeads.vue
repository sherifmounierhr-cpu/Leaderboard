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
    :class="hero ? 'gap-x-[clamp(12px,1.8vw,28px)] gap-y-1' : 'gap-x-[clamp(10px,1.3vw,20px)] gap-y-1'"
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
            ? 'size-8 lg:size-[clamp(26px,3.2vh,38px)] text-xs'
            : 'size-7 lg:size-[clamp(22px,2.6vh,32px)] text-[11px]'"
          :title="person.name"
        />
        <span
          v-if="group.extra"
          class="relative flex items-center justify-center rounded-full bg-avatar ring-2 ring-card font-bold text-avatar-text tabular-nums"
          :class="hero
            ? 'size-8 lg:size-[clamp(26px,3.2vh,38px)] text-[11px] lg:text-xs'
            : 'size-7 lg:size-[clamp(22px,2.6vh,32px)] text-[10px] lg:text-[11px]'"
        >+{{ group.extra }}</span>
      </div>
      <div class="flex flex-col items-start min-w-0 leading-tight text-start">
        <span
          class="font-medium text-mute whitespace-nowrap"
          :class="hero ? 'text-[11px] lg:text-[clamp(11px,1.2vh,14px)]' : 'text-[10px] lg:text-[clamp(10px,1.05vh,12px)]'"
        >{{ group.label }}</span>
        <span
          class="font-semibold text-strong truncate"
          :class="hero
            ? 'max-w-[22ch] text-caption lg:text-[clamp(13px,1.5vh,17px)]'
            : 'max-w-[16ch] text-[11px] lg:text-[clamp(11px,1.3vh,14px)]'"
          :title="group.names"
        >{{ group.names }}</span>
      </div>
    </li>
  </ul>
</template>
