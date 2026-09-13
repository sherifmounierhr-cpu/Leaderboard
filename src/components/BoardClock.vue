<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { clockDate, clockTime } from '@/lib/format'

/**
 * ثانية واحدة: الساعة تعرض الدقائق فقط، لكن النبض القصير يضمن أن التبديل
 * يحدث عند حدّ الدقيقة لا بعده بنصف دقيقة على شاشة معلّقة طوال اليوم.
 */
const TICK_MS = 1000

const { locale } = useI18n()
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, TICK_MS)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// قراءة locale تجعل النص يُعاد بناؤه عند تبديل اللغة
const time = computed(() => (locale.value, clockTime(now.value)))
const date = computed(() => (locale.value, clockDate(now.value)))
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/85"
  >
    <iconify-icon
      icon="mdi:clock-outline"
      aria-hidden="true"
      class="text-accent-live text-base lg:text-lg shrink-0"
    />
    <div class="flex flex-col leading-tight">
      <time class="font-bold tabular-nums text-base lg:text-lg" :datetime="now.toISOString()">
        {{ time }}
      </time>
      <span class="hidden sm:block text-white/55 text-eyebrow whitespace-nowrap">{{ date }}</span>
    </div>
  </div>
</template>
