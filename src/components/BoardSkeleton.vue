<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * هيكل اللوحة أثناء أول تحميل: نفس شكل المنصة والجدول بكتل رمادية نابضة،
 * بدل رسالة «لا توجد نتائج» اللي كانت بتظهر لثانية وتوحي إن البيانات ضاعت.
 */
defineProps<{ podium?: boolean }>()
const { t } = useI18n()

const BLOCK = 'rounded-md bg-strong/[0.07] animate-pulse motion-reduce:animate-none'
</script>

<template>
  <div class="flex-1 flex flex-col gap-6 lg:gap-[clamp(12px,2.2vh,28px)] min-h-0" role="status" :aria-label="t('admin.loading')">
    <div v-if="podium" class="hidden md:grid grid-cols-[1fr_1.22fr_1fr] gap-5 lg:gap-7 items-end">
      <div
        v-for="i in 3"
        :key="i"
        class="flex flex-col items-center gap-3 rounded-xl border border-card-border bg-card p-6"
        :class="i === 2 ? 'lg:h-[clamp(260px,40vh,440px)]' : 'lg:h-[clamp(220px,34vh,380px)]'"
      >
        <span :class="BLOCK" class="size-16 lg:size-20 rounded-2xl" />
        <span :class="BLOCK" class="h-5 w-1/2" />
        <span :class="BLOCK" class="mt-auto h-10 w-2/3" />
        <span :class="BLOCK" class="h-3 w-full rounded-full" />
      </div>
    </div>

    <div class="lg:flex-1 flex flex-col rounded-xl border border-card-border bg-card overflow-hidden min-h-0">
      <div class="h-12 bg-card-alt border-b border-card-border" />
      <div v-for="i in 4" :key="i" class="flex flex-1 items-center gap-4 px-6 py-4 border-b border-divider last:border-b-0">
        <span :class="BLOCK" class="h-6 w-8" />
        <span :class="BLOCK" class="size-10 rounded-xl" />
        <span :class="BLOCK" class="h-5 w-40" />
        <span :class="BLOCK" class="ms-auto h-6 w-16" />
        <span :class="BLOCK" class="h-3 w-1/4 rounded-full" />
      </div>
    </div>
  </div>
</template>
