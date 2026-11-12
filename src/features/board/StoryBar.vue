<script setup lang="ts">
/**
 * شريط تقدّم مقسّم لشاشات العرض المتتابع (الأخبار، الأسواق): قطعة لكل
 * شريحة، فيُقرأ من آخر الغرفة «إحنا في كام من كام» من غير أرقام.
 * القطعة الحالية تتملى بحركة CSS واحدة (transform) بدل تحديث العرض كل
 * 100ms من جافاسكربت.
 */
withDefaults(
  defineProps<{ count: number; index: number; durationMs: number; tone?: 'gold' | 'up' | 'down' }>(),
  { tone: 'gold' },
)

const FILL = { gold: 'bg-gold', up: 'bg-accent-live', down: 'bg-down' } as const
</script>

<template>
  <div class="flex w-full gap-[clamp(4px,0.5vw,10px)]" aria-hidden="true">
    <span
      v-for="i in count"
      :key="i"
      class="h-[clamp(4px,0.7vh,8px)] flex-1 overflow-hidden rounded-full bg-white/20"
    >
      <span v-if="i - 1 < index" class="block h-full rounded-full" :class="FILL[tone]" />
      <span
        v-else-if="i - 1 === index"
        :key="`${index}-${durationMs}`"
        class="block h-full rounded-full animate-rotate-progress"
        :class="FILL[tone]"
        :style="{ animationDuration: `${durationMs}ms` }"
      />
    </span>
  </div>
</template>
