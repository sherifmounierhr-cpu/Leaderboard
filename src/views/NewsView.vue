<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { useNews } from '@/composables/useNews'
import { advanceView } from '@/composables/useBoardControls'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useNewsControls } from '@/composables/useNewsControls'
import { dayKey } from '@/lib/region'
import BrandLogo from '@/components/BrandLogo.vue'
import StoryBar from '@/components/StoryBar.vue'

/**
 * نوبة الأخبار في التبديل التلقائي: أخبار النهارده واحد ورا التاني بملء
 * الشاشة، مش جدول. لما القائمة تخلص، الشاشة بتسلّم للنوبة اللي بعدها.
 *
 * مفيش عرض اتنين مع بعض عن قصد: خبر واحد كبير بيتقرا من آخر الغرفة.
 */

/** الشريط بقى حركة CSS، فالمؤقت للتبديل بين الأخبار بس. */
const TICK_MS = 250
/** لو مفيش أخبار النهارده، بنعرض آخر تلاتة بدل ما النوبة تعدّي فاضية. */
const FALLBACK = 3
/** مهلة انتظار الأخبار لو النوبة جت قبل ما توصل. */
const WAIT_MS = 6_000

const { t, locale } = useI18n()
const { items } = useNews()
const { settings } = useBoardMedia()
const { hiddenIds } = useNewsControls()

/** مدة الخبر الواحد — بتتظبط من صفحة الإدارة. */
const slideMs = computed(() => (settings.value.news_slide_s ?? 9) * 1000)
/** مدة الشاشة كلها لو اتحددت من الإدارة؛ فاضية = لحد ما الأخبار تخلص. */
const screenMs = computed(() => (settings.value.news_screen_s ? settings.value.news_screen_s * 1000 : 0))

const index = ref(0)
const startedAt = ref(Date.now())
const now = ref(Date.now())
const broken = ref(new Set<number>())
let clock: ReturnType<typeof setInterval> | null = null

const slides = computed(() => {
  const today = dayKey()
  // الأخبار المخفيّة من الإدارة ما بتوصلش الشاشة أصلاً
  const visible = items.value.filter((item) => !hiddenIds.value.has(item.id))
  const fresh = visible.filter((item) => {
    const date = new Date(item.date)
    return !Number.isNaN(date.getTime()) && dayKey(date) === today
  })
  return fresh.length ? fresh : visible.slice(0, FALLBACK)
})

const current = computed(() => slides.value[index.value] ?? null)

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
  // مدة ثابتة: تخلص عند موعدها بالظبط، حتى لو الأخبار أكتر أو أقل
  if (screenMs.value && now.value - mountedAt >= screenMs.value) {
    finish()
    return
  }
  if (now.value - startedAt.value < slideMs.value) return
  if (index.value + 1 < slides.value.length) show(index.value + 1)
  else if (screenMs.value) show(0)
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
    data-surface="dark"
    class="fixed inset-0 z-40 flex flex-col overflow-hidden bg-header text-white"
    :aria-label="t('news.label')"
  >
    <p v-if="!current" class="m-auto text-center text-white/60">{{ t('news.empty') }}</p>

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
      <!-- تعتيم بلون الهوية الغامق لا بالأسود: أسفل للنص، وأعلى للشعار والشريط -->
      <span
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,22,23,0.97)_0%,rgba(6,22,23,0.86)_36%,rgba(6,22,23,0.2)_66%,rgba(6,22,23,0.72)_100%)]"
      />

      <!-- إطار الهوية: الشعار، خبر كام من كام، واسم الشاشة -->
      <header class="relative flex items-center gap-[clamp(14px,2.4vw,40px)] px-[5vw] pt-[clamp(16px,3.6vh,44px)]">
        <BrandLogo tone="white" class="h-[clamp(34px,6.4vh,72px)]" />
        <StoryBar class="flex-1" :count="slides.length" :index="index" :duration-ms="slideMs" />
        <span class="flex shrink-0 items-center gap-[0.5em] rounded-full bg-gold px-[1.1em] py-[0.4em] font-bold text-[#0a2e2f] text-[clamp(13px,2vh,24px)]">
          <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-[1.25em]" />
          {{ t('news.label') }}
        </span>
      </header>

      <Transition name="slide" mode="out-in">
        <div
          :key="current.id"
          class="relative mt-auto flex w-full gap-[clamp(14px,1.8vw,34px)] px-[5vw] pb-[clamp(36px,8vh,110px)]"
        >
          <!-- خط الهوية بجانب العنوان: ذهبي للأخضر، بميل قمم الشعار في المعنى لا الشكل -->
          <span
            aria-hidden="true"
            class="rise w-[clamp(5px,0.5vw,10px)] shrink-0 rounded-full bg-[linear-gradient(to_bottom,var(--color-gold),var(--color-accent-live))]"
          />
          <div class="flex min-w-0 flex-col gap-[clamp(10px,2vh,24px)]">
            <p class="rise m-0 flex items-center gap-[0.7em] font-semibold text-white/70 text-[clamp(13px,2vh,24px)]">
              <span class="tabular-nums text-gold">{{ index + 1 }} / {{ slides.length }}</span>
              <template v-if="when"><span aria-hidden="true">·</span>{{ when }}</template>
            </p>

            <h2
              class="rise m-0 max-w-[24ch] font-extrabold leading-[1.12] tracking-[-0.01em] text-balance break-words text-[clamp(32px,7.4vh,96px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
              style="--i: 1"
            >{{ current.title }}</h2>

            <p
              v-if="current.excerpt"
              class="rise m-0 max-w-[70ch] font-medium leading-snug text-white/85 text-balance break-words text-[clamp(16px,3vh,38px)]"
              style="--i: 3"
            >{{ current.excerpt }}</p>
          </div>
        </div>
      </Transition>
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
