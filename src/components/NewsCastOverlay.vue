<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNewsControls } from '@/composables/useNewsControls'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { chime } from '@/composables/useChime'

/**
 * خبر بعته الإدارة لكل الشاشات فوراً. بيتعرض مرة واحدة لمدة عرض الخبر
 * المضبوطة × 2 — لأنه مقصود، مش دوره في اللفّة.
 *
 * الاحتفال بصفقة له الأولوية: لو فيه احتفال شغّال، البثّ يستنى وراه.
 */

const SEEN_KEY = 'everest.news.cast'

const { t } = useI18n()
const { latestCast } = useNewsControls()
const { settings } = useBoardMedia()
const { celebrations } = useSaleEvents()

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

const shown = computed(() => (celebrations.value.length ? null : pending.value))

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
      class="fixed inset-0 z-[57] flex cursor-pointer items-end overflow-hidden bg-header"
      role="dialog"
      aria-modal="true"
      :aria-label="shown.title"
      @click="close()"
    >
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
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,14,18,0.96)_0%,rgba(10,14,18,0.82)_34%,rgba(10,14,18,0.22)_64%,rgba(10,14,18,0.5)_100%)]"
      />

      <div class="relative flex w-full flex-col gap-[clamp(10px,2vh,24px)] px-[6vw] pb-[clamp(40px,9vh,120px)] pt-[6vh] text-white">
        <span class="flex w-fit items-center gap-[0.5em] rounded-full bg-gold px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-header text-[clamp(13px,2vh,24px)]">
          <iconify-icon icon="mdi:bullhorn-variant-outline" aria-hidden="true" class="text-[1.3em]" />
          {{ t('news.cast') }}
        </span>

        <h2
          class="m-0 max-w-[24ch] font-extrabold leading-[1.12] text-balance break-words text-[clamp(32px,7.4vh,96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >{{ shown.title }}</h2>

        <p
          v-if="shown.excerpt"
          class="m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,3vh,38px)]"
        >{{ shown.excerpt }}</p>
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
