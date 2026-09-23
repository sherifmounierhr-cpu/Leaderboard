<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { relativeTime } from '@/lib/format'
import { useNews } from '@/composables/useNews'

/**
 * شاشة أخبار السوق: خبر رئيسي بصورة كبيرة وجنبه أربعة أخبار، وكل 10 ثوانٍ
 * تتبدّل الصفحة للخمسة التاليين فتمرّ العشرة كلهم. شاشة مستقلة في التبديل
 * التلقائي، فما بتزاحمش جدول المتصدّرين على أي ارتفاع.
 */

const PAGE_MS = 10_000
const PER_PAGE = 5
const CLOCK_MS = 60_000

const { t, locale } = useI18n()
const { items, fetchedAt, hasNews } = useNews()

const page = ref(0)
const now = ref(new Date())
const broken = ref(new Set<number>())
let pager: ReturnType<typeof setInterval> | null = null
let clock: ReturnType<typeof setInterval> | null = null

const pages = computed(() => Math.max(Math.ceil(items.value.length / PER_PAGE), 1))

onMounted(() => {
  pager = setInterval(() => { page.value = (page.value + 1) % pages.value }, PAGE_MS)
  clock = setInterval(() => { now.value = new Date() }, CLOCK_MS)
})
onBeforeUnmount(() => {
  if (pager) clearInterval(pager)
  if (clock) clearInterval(clock)
})

function when(iso: string) {
  void locale.value
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : relativeTime(date, now.value)
}

const current = computed(() => {
  const start = (page.value % pages.value) * PER_PAGE
  return items.value.slice(start, start + PER_PAGE)
})
const lead = computed(() => current.value[0] ?? null)
const rest = computed(() => current.value.slice(1))

const updated = computed(() => (fetchedAt.value ? when(fetchedAt.value.toISOString()) : ''))
</script>

<template>
  <!-- الأخبار عربية دائماً، فالشاشة RTL حتى لو اللوحة بالإنجليزية -->
  <section dir="rtl" class="flex-1 flex flex-col min-h-0 gap-4 px-4 py-6 sm:px-8 lg:px-16 lg:pt-[clamp(12px,2.2vh,28px)] lg:pb-[clamp(14px,2.6vh,32px)]">
    <header class="flex shrink-0 items-center justify-between gap-3">
      <h2 class="m-0 flex items-center gap-2 font-semibold text-strong text-lg lg:text-[clamp(17px,2.4vh,26px)]">
        <iconify-icon icon="mdi:newspaper-variant-outline" aria-hidden="true" class="text-gold" />
        {{ t('news.label') }}
      </h2>
      <p v-if="updated" class="m-0 text-mute text-caption lg:text-note">
        {{ t('news.updated', { when: updated }) }}
        <span v-if="pages > 1" class="text-dim"> · {{ page + 1 }}/{{ pages }}</span>
      </p>
    </header>

    <p
      v-if="!hasNews"
      class="m-0 flex flex-1 items-center justify-center rounded-xl border border-dashed border-card-border text-mute"
    >{{ t('news.empty') }}</p>

    <Transition v-else name="news" mode="out-in">
      <div :key="page" class="grid flex-1 min-h-0 gap-4 lg:gap-5 lg:grid-cols-[1.25fr_1fr]">
        <!-- الخبر الرئيسي -->
        <a
          v-if="lead"
          :href="lead.url"
          target="_blank"
          rel="noopener"
          class="group flex min-h-0 flex-col overflow-hidden rounded-2xl border border-card-border bg-card no-underline shadow-[var(--shadow-panel)]"
        >
          <span class="relative block min-h-0 flex-1 bg-avatar">
            <img
              v-if="lead.image && !broken.has(lead.id)"
              :src="lead.image"
              alt=""
              referrerpolicy="no-referrer"
              class="absolute inset-0 size-full object-cover"
              @error="broken.add(lead.id)"
            />
            <span v-else aria-hidden="true" class="absolute inset-0 flex items-center justify-center text-dim text-5xl">
              <iconify-icon icon="mdi:image-outline" />
            </span>
          </span>
          <span class="flex shrink-0 flex-col gap-1.5 px-5 py-4">
            <span class="line-clamp-2 font-semibold text-strong text-lg lg:text-[clamp(18px,2.7vh,30px)] leading-snug">
              {{ lead.title }}
            </span>
            <span class="line-clamp-2 text-mute text-sm lg:text-[clamp(13px,1.8vh,18px)]">{{ lead.excerpt }}</span>
            <span class="text-dim text-caption lg:text-note">{{ when(lead.date) }}</span>
          </span>
        </a>

        <!-- بقية الصفحة -->
        <ul class="m-0 grid min-h-0 list-none grid-rows-4 gap-3 lg:gap-4 p-0">
          <li v-for="item in rest" :key="item.id" class="min-h-0">
            <a
              :href="item.url"
              target="_blank"
              rel="noopener"
              class="flex h-full items-center gap-3 lg:gap-4 overflow-hidden rounded-xl border border-card-border bg-card px-3 py-2.5 no-underline shadow-[var(--shadow-card)]"
            >
              <img
                v-if="item.image && !broken.has(item.id)"
                :src="item.image"
                alt=""
                referrerpolicy="no-referrer"
                class="h-full w-[clamp(84px,9vw,150px)] shrink-0 rounded-lg object-cover bg-avatar"
                @error="broken.add(item.id)"
              />
              <span
                v-else
                aria-hidden="true"
                class="flex h-full w-[clamp(84px,9vw,150px)] shrink-0 items-center justify-center rounded-lg bg-avatar text-dim text-2xl"
              >
                <iconify-icon icon="mdi:image-outline" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="line-clamp-2 font-semibold text-strong text-sm lg:text-[clamp(14px,1.9vh,20px)] leading-snug">
                  {{ item.title }}
                </span>
                <span class="text-dim text-caption lg:text-note">{{ when(item.date) }}</span>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.news-enter-active,
.news-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.news-enter-from { opacity: 0; transform: translateY(10px); }
.news-leave-to { opacity: 0; transform: translateY(-10px); }

@media (prefers-reduced-motion: reduce) {
  .news-enter-active,
  .news-leave-active { transition: none; }
}
</style>
