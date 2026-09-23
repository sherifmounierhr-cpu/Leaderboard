<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { useNews } from '@/composables/useNews'
import { advanceView } from '@/composables/useBoardControls'

/**
 * نوبة الأخبار في التبديل التلقائي: أخبار النهارده واحد ورا التاني بملء
 * الشاشة، مش جدول. لما القائمة تخلص، الشاشة بتسلّم للنوبة اللي بعدها.
 *
 * مفيش عرض اتنين مع بعض عن قصد: خبر واحد كبير بيتقرا من آخر الغرفة.
 */

/** مدة الخبر الواحد على الشاشة. */
const SLIDE_MS = 9_000
const TICK_MS = 100
/** لو مفيش أخبار النهارده، بنعرض آخر تلاتة بدل ما النوبة تعدّي فاضية. */
const FALLBACK = 3
/** مهلة انتظار الأخبار لو النوبة جت قبل ما توصل. */
const WAIT_MS = 6_000

const { t, locale } = useI18n()
const { items } = useNews()

const index = ref(0)
const startedAt = ref(Date.now())
const now = ref(Date.now())
const broken = ref(new Set<number>())
let clock: ReturnType<typeof setInterval> | null = null

/** تاريخ النهارده بتوقيت القاهرة، فاليوم يبدأ وينتهي مع يوم العمل. */
function cairoDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(at)
}

const slides = computed(() => {
  const today = cairoDay(new Date())
  const fresh = items.value.filter((item) => {
    const date = new Date(item.date)
    return !Number.isNaN(date.getTime()) && cairoDay(date) === today
  })
  return fresh.length ? fresh : items.value.slice(0, FALLBACK)
})

const current = computed(() => slides.value[index.value] ?? null)
const progress = computed(() => Math.min(100, ((now.value - startedAt.value) / SLIDE_MS) * 100))

function show(at: number) {
  index.value = at
  startedAt.value = Date.now()
  now.value = startedAt.value
  broken.value = new Set()
}

function step() {
  now.value = Date.now()
  // الأخبار ممكن تكون لسه في الطريق: نستنى شوية قبل ما نسلّم النوبة
  if (!slides.value.length) {
    if (now.value - mountedAt >= WAIT_MS) finish()
    return
  }
  if (now.value - startedAt.value < SLIDE_MS) return
  if (index.value + 1 < slides.value.length) show(index.value + 1)
  else finish()
}

let done = false
function finish() {
  if (done) return
  done = true
  advanceView()
}

const mountedAt = Date.now()

onMounted(() => {
  show(0)
  clock = setInterval(step, TICK_MS)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
})

// القائمة ممكن توصل متأخرة شوية عن تركيب الشاشة
watch(slides, (list, before) => {
  if (index.value >= list.length || !before?.length) show(0)
})

const when = computed(() => {
  void locale.value
  const iso = current.value?.date
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : relativeTime(date, new Date(now.value))
})
</script>

<template>
  <!-- الأخبار عربية دائماً، فالشاشة RTL حتى لو اللوحة بالإنجليزية -->
  <section
    dir="rtl"
    data-export-hide
    class="fixed inset-0 z-40 flex items-end overflow-hidden bg-header"
    :aria-label="t('news.label')"
  >
    <p v-if="!current" class="m-0 w-full text-center text-white/60">{{ t('news.empty') }}</p>

    <template v-else>
      <Transition name="slide" mode="out-in">
        <img
          v-if="current.image && !broken.has(current.id)"
          :key="current.id"
          :src="current.image"
          alt=""
          referrerpolicy="no-referrer"
          class="slide-zoom absolute inset-0 size-full object-cover"
          @error="broken.add(current.id)"
        />
      </Transition>
      <span
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,14,18,0.96)_0%,rgba(10,14,18,0.82)_34%,rgba(10,14,18,0.22)_64%,rgba(10,14,18,0.5)_100%)]"
      />

      <Transition name="slide" mode="out-in">
        <div
          :key="current.id"
          class="relative flex w-full flex-col gap-[clamp(10px,2vh,24px)] px-[6vw] pb-[clamp(40px,9vh,120px)] pt-[6vh] text-white"
        >
          <span class="flex w-fit items-center gap-[0.5em] rounded-full bg-white/12 px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(13px,2vh,24px)]">
            <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-gold text-[1.3em]" />
            {{ t('news.label') }}
            <span class="text-white/50">{{ index + 1 }}/{{ slides.length }}</span>
          </span>

          <h2
            class="m-0 max-w-[24ch] font-extrabold leading-[1.12] tracking-[-0.01em] text-balance break-words text-[clamp(32px,7.4vh,96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          >{{ current.title }}</h2>

          <p
            v-if="current.excerpt"
            class="m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,3vh,38px)]"
          >{{ current.excerpt }}</p>

          <p v-if="when" class="m-0 font-semibold text-white/55 text-[clamp(13px,1.9vh,22px)]">{{ when }}</p>
        </div>
      </Transition>

      <!-- الوقت الباقي للخبر الحالي -->
      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div class="h-full bg-gold transition-[width] duration-100 ease-linear" :style="{ width: `${progress}%` }" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.6s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
.slide-zoom {
  animation: slide-zoom 9s ease-out both;
}
@keyframes slide-zoom {
  from { transform: scale(1.05); }
  to { transform: scale(1.13); }
}
@media (prefers-reduced-motion: reduce) {
  .slide-enter-active,
  .slide-leave-active { transition: none; }
  .slide-zoom { animation: none; }
}
</style>
