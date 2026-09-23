<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { BREAKING_MS, useBreakingNews } from '@/composables/useBreakingNews'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { chime } from '@/composables/useChime'

/**
 * خبر جديد نزل على المدونة — يتعرض بملء الشاشة مرة واحدة لمدة 20 ثانية.
 * الاحتفال له الأولوية: لو فيه احتفال شغّال، الخبر يستنى وراه.
 */

const { t, locale } = useI18n()
const { current, dismiss } = useBreakingNews()
const { celebrations } = useSaleEvents()

const now = ref(Date.now())
const broken = ref(false)
let clock: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 250)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  document.removeEventListener('keydown', onKeydown)
})

const shown = computed(() => (celebrations.value.length ? null : current.value))

const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => Math.min(100, Math.max(0, 100 - (remaining.value / BREAKING_MS) * 100)))

watch(remaining, (ms) => { if (shown.value && ms <= 0) dismiss() })
// immediate: الخبر ممكن يكون جاهز قبل ما المكوّن يركّب، فالـ watch العادي يفوته
watch(() => shown.value?.item.id, (id) => {
  broken.value = false
  if (id) chime()
}, { immediate: true })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) dismiss()
}

const when = computed(() => {
  void locale.value
  const iso = shown.value?.item.date
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : relativeTime(date, new Date(now.value))
})
</script>

<template>
  <Transition name="breaking">
    <div
      v-if="shown"
      dir="rtl"
      data-export-hide
      class="fixed inset-0 z-[56] flex cursor-pointer items-end overflow-hidden bg-header"
      role="dialog"
      aria-modal="true"
      :aria-label="shown.item.title"
      @click="dismiss()"
    >
      <!-- الصورة بأكبر مقاس متاح، مالية الشاشة -->
      <img
        v-if="shown.item.image && !broken"
        :src="shown.item.image"
        alt=""
        referrerpolicy="no-referrer"
        class="breaking-zoom absolute inset-0 size-full object-cover"
        @error="broken = true"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,14,18,0.96)_0%,rgba(10,14,18,0.82)_32%,rgba(10,14,18,0.25)_62%,rgba(10,14,18,0.45)_100%)]"
      />

      <div class="breaking-in relative flex w-full flex-col gap-[clamp(10px,2vh,24px)] px-[6vw] pb-[clamp(36px,8vh,110px)] pt-[6vh] text-white">
        <span
          class="flex w-fit items-center gap-[0.5em] rounded-full bg-down px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(14px,2.2vh,26px)]"
        >
          <span aria-hidden="true" class="size-[0.55em] rounded-full bg-white animate-pulse-dot" />
          {{ t('news.breaking') }}
        </span>

        <h2
          class="m-0 max-w-[24ch] font-extrabold leading-[1.12] tracking-[-0.01em] text-balance break-words text-[clamp(32px,7.4vh,96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >{{ shown.item.title }}</h2>

        <p
          v-if="shown.item.excerpt"
          class="m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,3vh,38px)]"
        >{{ shown.item.excerpt }}</p>

        <p class="m-0 flex items-center gap-2 font-semibold text-white/60 text-[clamp(13px,1.9vh,22px)]">
          <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-gold" />
          {{ t('news.label') }}
          <template v-if="when"> · {{ when }}</template>
        </p>
      </div>

      <!-- الوقت الباقي -->
      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div class="h-full bg-down transition-[width] duration-300 ease-linear" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.breaking-enter-active,
.breaking-leave-active {
  transition: opacity 0.5s ease;
}
.breaking-enter-from,
.breaking-leave-to {
  opacity: 0;
}
.breaking-in {
  animation: breaking-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes breaking-in {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: none; }
}
/* زوم بطيء جداً يدّي الصورة الساكنة إحساس بالحياة على الشاشة */
.breaking-zoom {
  animation: breaking-zoom 20s ease-out both;
}
@keyframes breaking-zoom {
  from { transform: scale(1.06); }
  to { transform: scale(1.14); }
}
@media (prefers-reduced-motion: reduce) {
  .breaking-in, .breaking-zoom { animation: none; }
}
</style>
