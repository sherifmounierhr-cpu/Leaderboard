<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from './BrandLogo.vue'
import { useNewsControls } from '@/composables/useNewsControls'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { chime } from '@/composables/useChime'

/**
 * خبر بعته الإدارة لكل الشاشات فوراً. بيتعرض مرة واحدة لمدة عرض الخبر
 * المضبوطة × 2 — لأنه مقصود، مش دوره في اللفّة.
 *
 * ترتيبه بين الشاشات التانية اللي بتغطّي اللوحة مكتوب في `useOverlayQueue`،
 * مش هنا: لو واحدة أعلى منه شغّالة، بيفضل «طالب» من غير ما يظهر لحد ما تخلص.
 */

const SEEN_KEY = 'everest.news.cast'

const { t } = useI18n()
const { latestCast } = useNewsControls()
const { settings } = useBoardMedia()

const dismissed = ref<string | null>(null)
const now = ref(Date.now())
const startedAt = ref(0)
const broken = ref(false)
let clock: ReturnType<typeof setInterval> | null = null

/** آخر بثّ اتعرض على الشاشة دي — فإعادة التحميل ما بتعيدهوش. */
function readSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY) } catch { return null }
}
function writeSeen(id: string) {
  try { localStorage.setItem(SEEN_KEY, id) } catch { /* تخزين محظور */ }
}

const holdMs = computed(() => (settings.value.news_slide_s ?? 9) * 2000)

const pending = computed(() => {
  const cast = latestCast.value
  if (!cast) return null
  if (cast.id === dismissed.value) return null
  return cast
})

const active = useOverlayLayer('cast', computed(() => pending.value !== null))
const shown = computed(() => (active.value ? pending.value : null))

const remaining = computed(() => (startedAt.value ? Math.max(0, startedAt.value + holdMs.value - now.value) : 0))
const progress = computed(() =>
  startedAt.value ? Math.min(100, ((now.value - startedAt.value) / holdMs.value) * 100) : 0,
)

function close() {
  const cast = shown.value
  if (cast) {
    dismissed.value = cast.id
    writeSeen(cast.id)
  }
  startedAt.value = 0
}

watch(
  () => shown.value?.id,
  (id) => {
    if (!id) return
    broken.value = false
    startedAt.value = Date.now()
    now.value = startedAt.value
    chime()
  },
  { immediate: true },
)

watch(remaining, (ms) => { if (shown.value && startedAt.value && ms <= 0) close() })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) close()
}

onMounted(() => {
  // البثّ اللي اتعرض قبل إعادة التحميل ما يتعادش
  dismissed.value = readSeen()
  clock = setInterval(() => { now.value = Date.now() }, 250)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="cast">
    <div
      v-if="shown"
      dir="rtl"
      data-export-hide
      data-surface="dark"
      class="fixed inset-0 z-[57] flex cursor-pointer flex-col overflow-hidden bg-header text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="shown.title"
      @click="close()"
    >
      <!-- خبر بلا صورة (أو صورته ما اتحمّلتش): سطح الهوية بدل شاشة غامقة فاضية -->
      <div v-if="!shown.image || broken" aria-hidden="true" class="absolute inset-0 [background:var(--brand-surface)]">
        <span class="peaks !w-[62%] !opacity-[0.08]" />
      </div>
      <img
        v-if="shown.image && !broken"
        :src="shown.image"
        alt=""
        referrerpolicy="no-referrer"
        class="absolute inset-0 size-full object-cover"
        @error="broken = true"
      />
      <span
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,22,23,0.97)_0%,rgba(6,22,23,0.86)_36%,rgba(6,22,23,0.2)_66%,rgba(6,22,23,0.72)_100%)]"
      />

      <header class="relative flex items-center justify-between gap-[clamp(14px,2.4vw,40px)] px-[5vw] pt-[clamp(16px,3.6vh,44px)]">
        <BrandLogo tone="white" class="h-[clamp(34px,6.4vh,72px)]" />
        <span class="flex shrink-0 items-center gap-[0.5em] rounded-full bg-gold px-[1.2em] py-[0.45em] font-bold tracking-[0.04em] text-[#0a2e2f] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] text-[clamp(15px,min(2.4vh,1.44vw),30px)]">
          <iconify-icon icon="mdi:bullhorn-variant-outline" aria-hidden="true" class="text-[1.3em]" />
          {{ t('news.cast') }}
        </span>
      </header>

      <div :key="shown.id" class="relative mt-auto flex min-h-0 w-full gap-[clamp(14px,1.8vw,34px)] px-[5vw] pt-[clamp(12px,2vh,28px)] pb-[clamp(40px,9vh,120px)]">
        <span
          aria-hidden="true"
          class="rise w-[clamp(5px,0.5vw,10px)] shrink-0 rounded-full bg-[linear-gradient(to_bottom,var(--color-gold),var(--color-accent-live))]"
        />
        <div class="flex min-w-0 flex-col gap-[clamp(10px,2vh,24px)]">
          <h2
            class="rise m-0 max-w-[24ch] font-extrabold leading-[1.12] text-balance break-words text-[clamp(32px,min(7.4vh,4.44vw),96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            style="--i: 1"
          >{{ shown.title }}</h2>

          <p
            v-if="shown.excerpt"
            class="rise m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,min(3vh,1.8vw),38px)]"
            style="--i: 3"
          >{{ shown.excerpt }}</p>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div class="h-full bg-gold transition-[width] duration-300 ease-linear" :style="{ width: `${progress}%` }" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cast-enter-active,
.cast-leave-active {
  transition: opacity 0.5s ease;
}
.cast-enter-from,
.cast-leave-to {
  opacity: 0;
}
</style>
