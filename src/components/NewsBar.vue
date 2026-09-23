<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { useNews } from '@/composables/useNews'

/**
 * شريط أخبار السوق أسفل اللوحة: بطاقة بصورة الخبر تتبدّل كل 10 ثوانٍ، وجنبها
 * شريط متحرّك بكل العناوين. مستقل تماماً عن جدول المتصدّرين — بياخد ارتفاعه
 * من أسفل الشاشة ولا يمسّ تخطيط الجدول. اتجاهه RTL دائماً لأن الأخبار عربية،
 * حتى لو اللوحة معروضة بالإنجليزية.
 */

const ROTATE_MS = 10_000
const CLOCK_MS = 60_000
/** سرعة الشريط: ثوانٍ لكل عنوان، تكفي لقراءته من آخر الغرفة. */
const SECONDS_PER_HEADLINE = 7

const { t, locale } = useI18n()
const { items, hasNews } = useNews()

/**
 * الشريط بياخد ~70px من أسفل الشاشة. على 1920×1080 اللوحة بتستوعبها من غير ما
 * يتأثر الجدول، لكن على 1366×768 مفيش فراغ أصلاً فكان هيغطي الصف الأخير —
 * فبنخفيه على الشاشات القصيرة. `?news=1` يفرض ظهوره و`?news=0` يقفله.
 */
const MIN_HEIGHT = 900
const forced = new URLSearchParams(location.search).get('news')
const roomy = ref(window.innerHeight > MIN_HEIGHT)
const onResize = () => { roomy.value = window.innerHeight > MIN_HEIGHT }
const show = computed(() => forced !== '0' && (forced === '1' || roomy.value))

const index = ref(0)
const now = ref(new Date())
const broken = ref(new Set<number>())
let rotator: ReturnType<typeof setInterval> | null = null
let clock: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  rotator = setInterval(() => {
    const n = items.value.length
    index.value = n ? (index.value + 1) % n : 0
  }, ROTATE_MS)
  clock = setInterval(() => { now.value = new Date() }, CLOCK_MS)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  if (rotator) clearInterval(rotator)
  if (clock) clearInterval(clock)
  window.removeEventListener('resize', onResize)
})

const current = computed(() => {
  const list = items.value
  return list.length ? list[index.value % list.length] : null
})

const when = computed(() => {
  void locale.value
  const iso = current.value?.date
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : relativeTime(date, now.value)
})

/** مدة دورة كاملة للشريط — تطول مع عدد العناوين فتثبت سرعة القراءة. */
const marqueeDuration = computed(() => `${Math.max(items.value.length, 1) * SECONDS_PER_HEADLINE}s`)
</script>

<template>
  <aside
    v-if="show && hasNews && current"
    data-export-hide
    dir="rtl"
    class="shrink-0 border-t border-card-border bg-card"
    :aria-label="t('news.label')"
  >
    <div class="flex items-stretch overflow-hidden h-[clamp(58px,8.4vh,92px)]">
      <!-- علامة القسم -->
      <span
        class="hidden sm:flex shrink-0 items-center gap-2 bg-header px-4 lg:px-6 font-semibold text-white text-sm lg:text-note"
      >
        <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-gold text-lg lg:text-xl" />
        {{ t('news.label') }}
      </span>

      <!-- بطاقة الخبر الحالي -->
      <Transition name="news" mode="out-in">
        <a
          :key="current.id"
          :href="current.url"
          target="_blank"
          rel="noopener"
          class="flex min-w-0 shrink-0 items-center gap-3 border-e border-divider px-3 lg:px-4 w-[min(50%,680px)] no-underline"
        >
          <img
            v-if="current.image && !broken.has(current.id)"
            :src="current.image"
            alt=""
            referrerpolicy="no-referrer"
            class="hidden sm:block h-[clamp(40px,6vh,68px)] aspect-[16/10] shrink-0 rounded-lg object-cover bg-avatar"
            @error="broken.add(current.id)"
          />
          <span
            v-else
            aria-hidden="true"
            class="hidden sm:flex h-[clamp(40px,6vh,68px)] aspect-[16/10] shrink-0 items-center justify-center rounded-lg bg-avatar text-dim text-xl"
          >
            <iconify-icon icon="mdi:image-outline" />
          </span>

          <span class="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span class="truncate font-semibold text-strong text-sm lg:text-[clamp(13px,1.7vh,17px)]">
              {{ current.title }}
            </span>
            <span class="truncate text-mute text-caption">
              <template v-if="when">{{ when }}</template>
              <template v-if="when && current.excerpt"> · </template>{{ current.excerpt }}
            </span>
          </span>
        </a>
      </Transition>

      <!-- الشريط المتحرّك بكل العناوين -->
      <div class="news-fade relative hidden md:flex min-w-0 flex-1 items-center overflow-hidden" aria-hidden="true">
        <div class="flex w-max items-center animate-news-marquee" :style="{ animationDuration: marqueeDuration }">
          <!-- نسختان متطابقتان: الحركة بنصف عرض المسار فتلتف بلا قفزة -->
          <div
            v-for="copy in 2"
            :key="copy"
            class="flex shrink-0 items-center gap-8 pe-8 lg:gap-12 lg:pe-12"
          >
            <span
              v-for="item in items"
              :key="`${copy}-${item.id}`"
              class="flex shrink-0 items-center gap-2 whitespace-nowrap text-strong text-sm lg:text-[clamp(13px,1.6vh,16px)]"
            >
              <span aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-accent" />
              {{ item.title }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* العناوين بتدخل من الطرف البعيد عن البطاقة، فبتتلاشى بدل ما تتقص فجأة */
.news-fade {
  -webkit-mask-image: linear-gradient(to left, transparent 0, #000 3rem);
  mask-image: linear-gradient(to left, transparent 0, #000 3rem);
}
[dir="rtl"] .news-fade {
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 3rem);
  mask-image: linear-gradient(to right, transparent 0, #000 3rem);
}

.news-enter-active,
.news-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.news-enter-from { opacity: 0; transform: translateY(6px); }
.news-leave-to { opacity: 0; transform: translateY(-6px); }

@media (prefers-reduced-motion: reduce) {
  .news-enter-active,
  .news-leave-active { transition: none; }
}
</style>
