<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ALERT_MS, useMarketAlerts } from '@/composables/useMarketAlerts'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import Sparkline from './Sparkline.vue'
import BrandLogo from './BrandLogo.vue'
import { chime } from '@/composables/useChime'

/**
 * تنبيه حركة سعر بملء الشاشة — آخر واحد في الأولوية، فما يزاحمش حاجة
 * أهم منه. الترتيب نفسه مكتوب في `useOverlayQueue`، مش هنا.
 */

const { t, n } = useI18n()

/** نصوص التنبيه بالعربية دايماً، زي شاشة الأسواق. */
const ar = (key: string) => t(key, {}, { locale: 'ar' })
const { current, dismiss } = useMarketAlerts()

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 250)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  document.removeEventListener('keydown', onKeydown)
})

const active = useOverlayLayer('market', computed(() => current.value !== null))
const shown = computed(() => (active.value ? current.value : null))
const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => Math.min(100, Math.max(0, 100 - (remaining.value / ALERT_MS) * 100)))
const hasSpark = computed(() => (shown.value?.quote.spark.length ?? 0) > 2)

// شرط مركّب: تنبيه خلص وقته وهو مستنّي بيرجع والباقي صفر من غير ما يتغيّر
watch(
  () => Boolean(shown.value) && remaining.value <= 0,
  (expired) => { if (expired) dismiss() },
)
// immediate: نفس سبب الخبر العاجل — التنبيه ممكن يسبق تركيب المكوّن
watch(() => shown.value?.quote.key, (key) => { if (key) chime() }, { immediate: true })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) dismiss()
}

const up = computed(() => (shown.value?.quote.changePct ?? 0) > 0)

const price = computed(() => {
  const quote = shown.value?.quote
  if (!quote) return ''
  const digits = quote.price >= 1000 ? 0 : quote.price >= 10 ? 2 : 3
  return n(quote.price, { minimumFractionDigits: digits, maximumFractionDigits: digits })
})

const move = computed(() => {
  const pct = shown.value?.quote.changePct ?? 0
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
})
</script>

<template>
  <Transition name="alert">
    <div
      v-if="shown"
      dir="rtl"
      data-export-hide
      data-surface="dark"
      class="fixed inset-0 z-[54] isolate flex cursor-pointer flex-col overflow-hidden text-white"
      :class="up
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#12615c_0%,#0c3231_55%,#0a1a1b_100%)]'
        : 'bg-[radial-gradient(120%_90%_at_50%_0%,#6b241f_0%,#361513_55%,#170b0a_100%)]'"
      role="dialog"
      aria-modal="true"
      :aria-label="ar(`markets.name.${shown.quote.key}`)"
      @click="dismiss()"
    >
      <span class="peaks -z-10 !opacity-[0.035]" aria-hidden="true" />

      <!-- نفس تركيب شاشة الأسواق: التنبيه شريحة منها جت قبل دورها -->
      <header class="relative flex items-center justify-between gap-[clamp(14px,2.4vw,40px)] px-[5vw] pt-[clamp(16px,3.6vh,44px)]">
        <BrandLogo tone="white" class="h-[clamp(34px,6.4vh,72px)]" />
        <span
          class="flex shrink-0 items-center gap-[0.5em] rounded-full border border-white/25 bg-white/12 px-[1.2em] py-[0.45em] font-bold tracking-[0.04em] text-[clamp(15px,2.4vh,30px)]"
        >
          <iconify-icon
            :icon="up ? 'mdi:trending-up' : 'mdi:trending-down'"
            aria-hidden="true"
            class="text-[1.3em]"
            :class="up ? 'text-accent-live' : 'text-[#ff9d94]'"
          />
          {{ ar(up ? 'markets.alert.up' : 'markets.alert.down') }}
        </span>
      </header>

      <div
        class="relative grid min-h-0 flex-1 items-center gap-[clamp(20px,4vw,72px)] px-[6vw] pb-[clamp(24px,6vh,80px)]"
        :class="hasSpark ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]' : 'justify-items-center text-center'"
      >
        <div class="flex min-w-0 flex-col gap-[clamp(10px,2.2vh,30px)]" :class="hasSpark ? 'items-start max-lg:items-center max-lg:text-center' : 'items-center'">
          <h2 class="rise m-0 font-extrabold leading-[1.1] text-balance break-words text-[clamp(30px,6.5vh,86px)]">
            {{ ar(`markets.name.${shown.quote.key}`) }}
          </h2>

          <p class="rise m-0 flex items-baseline gap-[0.4em] font-extrabold tabular-nums leading-none text-[clamp(44px,11vh,150px)]" style="--i: 1">
            <span dir="ltr">{{ price }}</span>
            <span class="font-semibold text-white/60 text-[0.26em]">
              {{ shown.quote.currency }}<template v-if="shown.quote.unit"> / {{ ar(`markets.unit.${shown.quote.unit}`) }}</template>
            </span>
          </p>

          <p
            class="rise m-0 flex items-center gap-[0.35em] rounded-[0.5em] px-[0.5em] py-[0.15em] font-extrabold tabular-nums text-[clamp(24px,5vh,64px)]"
            :class="up ? 'bg-accent-live/15 text-accent-live' : 'bg-down/20 text-[#ff9d94]'"
            style="--i: 2"
          >
            <iconify-icon :icon="up ? 'mdi:arrow-up-bold' : 'mdi:arrow-down-bold'" aria-hidden="true" class="text-[0.8em]" />
            <!-- بدون عزل، علامة السالب بتتنقل لآخر النسبة في الاتجاه العربي -->
            <bdi dir="ltr">{{ move }}</bdi>
            <span class="ms-[0.3em] font-semibold text-white/60 text-[0.42em]">{{ ar('markets.sinceClose') }}</span>
          </p>
        </div>

        <div
          v-if="hasSpark"
          class="rise flex min-w-0 flex-col gap-[clamp(10px,2vh,24px)] rounded-[clamp(18px,3vh,36px)] border border-white/12 bg-white/[0.06] p-[clamp(16px,3.2vh,44px)]"
          style="--i: 2"
        >
          <p class="m-0 flex items-center gap-[0.5em] font-semibold text-white/65 text-[clamp(13px,2vh,24px)]">
            <iconify-icon icon="mdi:chart-line" aria-hidden="true" class="text-[1.2em]" />
            {{ ar('markets.lastMonth') }}
          </p>
          <Sparkline :points="shown.quote.spark" :up="up" class="h-[clamp(110px,34vh,420px)] w-full" />
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div
          class="h-full transition-[width] duration-300 ease-linear"
          :class="up ? 'bg-accent-live' : 'bg-[#ff6f64]'"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.alert-enter-active,
.alert-leave-active {
  transition: opacity 0.45s ease;
}
.alert-enter-from,
.alert-leave-to {
  opacity: 0;
}
</style>
