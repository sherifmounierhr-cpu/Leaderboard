<script setup lang="ts">
withDefaults(
  defineProps<{ pct: number; soft?: boolean; tall?: boolean }>(),
  { soft: false, tall: false },
)
</script>

<template>
  <div
    class="w-full rounded-full overflow-hidden ring-1 ring-inset ring-strong/5"
    :class="[
      tall ? 'h-3 lg:h-3.5' : 'h-2.5 lg:h-3',
      soft ? 'bg-accent/12' : 'bg-track',
    ]"
  >
    <i
      class="block h-full rounded-full bg-linear-to-b from-accent to-accent-strong animate-bar-grow transition-[width] duration-700 ease-out motion-reduce:transition-none"
      :style="{ width: `${Math.min(pct, 100)}%` }"
    />
  </div>
</template>
