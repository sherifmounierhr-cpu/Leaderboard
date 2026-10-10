<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from './BrandLogo.vue'
import { relativeTime } from '@/lib/format'
import { BREAKING_MS, useBreakingNews } from '@/composables/useBreakingNews'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { chime } from '@/composables/useChime'

/**
 * خبر جديد نزل على المدونة — يتعرض بملء الشاشة مرة واحدة لمدة 20 ثانية.
 *
 * ترتيبه بين الشاشات التانية اللي بتغطّي اللوحة مكتوب في `useOverlayQueue`،
 * مش هنا: لو واحدة أعلى منه شغّالة، بيفضل «طالب» من غير ما يظهر لحد ما تخلص.
 */

const { t, locale } = useI18n()
const { current, dismiss } = useBreakingNews()

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

const active = useOverlayLayer('breaking', computed(() => current.value !== null))
const shown = computed(() => (active.value ? current.value : null))

const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => Math.min(100, Math.max(0, 100 - (remaining.value / BREAKING_MS) * 100)))

// شرط مركّب لا مراقبة `remaining` لوحدها: خبر خلص وقته وهو مستنّي ورا احتفال
// بيرجع والباقي صفر من غير ما يتغيّر، فالمراقبة ما كانتش بتقلع ويفضل معلّق على الشاشة.
watch(
  () => Boolean(shown.value) && remaining.value <= 0,
  (expired) => { if (expired) dismiss() },
)
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
      data-surface="dark"
      class="fixed inset-0 z-[56] flex cursor-pointer flex-col overflow-hidden bg-header text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="shown.item.title"
      @click="dismiss()"
    >
      <!-- الصورة بأكبر مقاس متاح، مالية الشاشة -->
      <!-- خبر بلا صورة (أو صورته ما اتحمّلتش): سطح الهوية بدل شاشة غامقة فاضية -->
      <div v-if="!shown.item.image || broken" aria-hidden="true" class="absolute inset-0 [background:var(--brand-surface)]">
        <span class="peaks !w-[62%] !opacity-[0.08]" />
      </div>
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
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,22,23,0.97)_0%,rgba(6,22,23,0.86)_36%,rgba(6,22,23,0.2)_66%,rgba(6,22,23,0.72)_100%)]"
      />

      <!-- نفس إطار شاشة الأخبار؛ الأحمر محجوز لشارة «خبر جديد» وشريط الوقت -->
      <header class="relative flex items-center justify-between gap-[clamp(14px,2.4vw,40px)] px-[5vw] pt-[clamp(16px,3.6vh,44px)]">
        <BrandLogo tone="white" class="h-[clamp(34px,6.4vh,72px)]" />
        <span
          class="flex shrink-0 items-center gap-[0.55em] rounded-full bg-[#c13c34] px-[1.2em] py-[0.45em] font-bold tracking-[0.04em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] text-[clamp(15px,2.4vh,30px)]"
        >
          <span aria-hidden="true" class="size-[0.55em] rounded-full bg-white animate-pulse-dot" />
          {{ t('news.breaking') }}
        </span>
      </header>

      <div class="relative mt-auto flex w-full gap-[clamp(14px,1.8vw,34px)] px-[5vw] pb-[clamp(36px,8vh,110px)]">
        <span
          aria-hidden="true"
          class="rise w-[clamp(5px,0.5vw,10px)] shrink-0 rounded-full bg-[linear-gradient(to_bottom,#ff8a80,var(--color-accent-live))]"
        />
        <div class="flex min-w-0 flex-col gap-[clamp(10px,2vh,24px)]">
          <p class="rise m-0 flex items-center gap-[0.5em] font-semibold text-white/70 text-[clamp(13px,2vh,24px)]">
            <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-gold text-[1.2em]" />
            {{ t('news.label') }}
            <template v-if="when"><span aria-hidden="true">·</span>{{ when }}</template>
          </p>

          <h2
            class="rise m-0 max-w-[24ch] font-extrabold leading-[1.12] tracking-[-0.01em] text-balance break-words text-[clamp(32px,7.4vh,96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            style="--i: 1"
          >{{ shown.item.title }}</h2>

          <p
            v-if="shown.item.excerpt"
            class="rise m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,3vh,38px)]"
            style="--i: 3"
          >{{ shown.item.excerpt }}</p>
        </div>
      </div>

      <!-- الوقت الباقي -->
      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div class="h-full bg-[#ff6f64] transition-[width] duration-300 ease-linear" :style="{ width: `${progress}%` }" />
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
