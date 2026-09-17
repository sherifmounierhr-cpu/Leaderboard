<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAnnouncements } from '@/composables/useAnnouncements'
import { useSaleEvents, type Celebration } from '@/composables/useSaleEvents'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'

/**
 * رسالة ترحيب أو تحفيز بملء الشاشة. الاحتفال له الأولوية: لو فيه احتفال
 * معروض، الرسالة تستنى وراه (وقتها بيعدّي، فلو خلص الاحتفال بعد نهايتها ما تظهرش).
 */
const props = withDefaults(defineProps<{ previewOnly?: boolean }>(), { previewOnly: false })

const { t } = useI18n()
const { current, dismiss } = useAnnouncements({ schedule: !props.previewOnly })
// في الإدارة مفيش احتفالات: ما نشتركش في الأحداث هناك
const celebrations = props.previewOnly ? ref<Celebration[]>([]) : useSaleEvents().celebrations
const { settings, urlOf } = useBoardMedia()
const { play, stop } = useAudioPlayer()

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 250) })
onBeforeUnmount(() => { if (clock) clearInterval(clock); stop() })

const shown = computed(() => {
  const c = current.value
  if (!c || celebrations.value.length) return null
  if (props.previewOnly && !c.preview) return null
  return c
})

const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => {
  const s = shown.value
  if (!s) return 0
  return Math.min(100, Math.max(0, 100 - (remaining.value / (s.announcement.duration_s * 1000)) * 100))
})

watch(remaining, (ms) => { if (shown.value && ms <= 0) dismiss() })

// المقطع يبدأ مع ظهور الرسالة، ولمدة عرضها الباقية بس
watch(
  () => shown.value?.key,
  (key) => {
    stop()
    const s = shown.value
    if (!key || !s) return
    const url = urlOf(s.announcement.clip_id)
    if (url) void play(url, settings.value.volume, remaining.value / 1000)
  },
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) close()
}
function close() {
  stop()
  dismiss()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const isWelcome = computed(() => shown.value?.announcement.style === 'welcome')
</script>

<template>
  <Transition name="announce">
    <div
      v-if="shown"
      data-export-hide
      class="fixed inset-0 z-[58] flex cursor-pointer flex-col items-center justify-center overflow-hidden px-[6vw] text-center text-white"
      :class="isWelcome
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#2f7a55_0%,#123b2a_55%,#0b1f17_100%)]'
        : 'bg-[radial-gradient(120%_90%_at_50%_100%,#6b4f16_0%,#1d3a2b_50%,#0c1a14_100%)]'"
      role="dialog"
      aria-modal="true"
      :aria-label="shown.announcement.title"
      @click="close"
    >
      <!-- زخرفة خفيفة: دوائر ضوء بطيئة، بدون كونفيتي حتى لا تُخلط بالاحتفال -->
      <span aria-hidden="true" class="announce-glow pointer-events-none absolute -top-[20vh] -start-[10vw] size-[60vh] rounded-full bg-white/10 blur-3xl" />
      <span aria-hidden="true" class="announce-glow pointer-events-none absolute -bottom-[25vh] -end-[10vw] size-[70vh] rounded-full blur-3xl" :class="isWelcome ? 'bg-accent-live/25' : 'bg-gold/25'" />

      <div class="announce-in relative flex max-w-[min(90vw,80rem)] flex-col items-center gap-[clamp(16px,3.5vh,44px)]">
        <div
          class="flex items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(14px,2.3vh,28px)]"
        >
          <iconify-icon
            :icon="isWelcome ? 'mdi:hand-wave' : 'mdi:rocket-launch'"
            aria-hidden="true"
            class="text-[1.3em]"
            :class="isWelcome ? 'text-accent-live' : 'text-gold'"
          />
          {{ t(`announce.${shown.announcement.style}`) }}
        </div>

        <h2
          dir="auto"
          class="m-0 font-extrabold leading-[1.1] tracking-[-0.01em] text-balance break-words text-[clamp(40px,10vh,128px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
        >{{ shown.announcement.title }}</h2>

        <p
          v-if="shown.announcement.body"
          dir="auto"
          class="m-0 max-w-[60ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(20px,4.2vh,52px)]"
        >{{ shown.announcement.body }}</p>
      </div>

      <!-- الوقت الباقي -->
      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div
          class="h-full transition-[width] duration-300 ease-linear"
          :class="isWelcome ? 'bg-accent-live' : 'bg-gold'"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.announce-enter-active,
.announce-leave-active {
  transition: opacity 0.5s ease;
}
.announce-enter-from,
.announce-leave-to {
  opacity: 0;
}
.announce-in {
  animation: announce-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes announce-in {
  from { opacity: 0; transform: translateY(24px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.announce-glow {
  animation: announce-glow 9s ease-in-out infinite alternate;
}
@keyframes announce-glow {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(4vw, 3vh) scale(1.12); }
}
@media (prefers-reduced-motion: reduce) {
  .announce-in, .announce-glow { animation: none; }
}
</style>
