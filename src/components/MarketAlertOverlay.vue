<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ALERT_MS, useMarketAlerts } from '@/composables/useMarketAlerts'
import { useBreakingNews } from '@/composables/useBreakingNews'
import { useSaleEvents } from '@/composables/useSaleEvents'
import Sparkline from './Sparkline.vue'
import { chime } from '@/composables/useChime'

/**
 * تنبيه حركة سعر بملء الشاشة. آخر واحد في الأولوية: الاحتفال بصفقة أولاً،
 * وبعده الخبر العاجل، وبعدهم التنبيه — فما يزاحمش حاجة أهم منه.
 */

const { t, n, locale } = useI18n()
const { current, dismiss } = useMarketAlerts()
const { current: breaking } = useBreakingNews()
const { celebrations } = useSaleEvents()

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

const shown = computed(() => (celebrations.value.length || breaking.value ? null : current.value))
const remaining = computed(() => (shown.value ? Math.max(0, shown.value.endsAt - now.value) : 0))
const progress = computed(() => Math.min(100, Math.max(0, 100 - (remaining.value / ALERT_MS) * 100)))

watch(remaining, (ms) => { if (shown.value && ms <= 0) dismiss() })
// immediate: نفس سبب الخبر العاجل — التنبيه ممكن يسبق تركيب المكوّن
watch(() => shown.value?.quote.key, (key) => { if (key) chime() }, { immediate: true })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && shown.value) dismiss()
}

const up = computed(() => (shown.value?.quote.changePct ?? 0) > 0)

const price = computed(() => {
  void locale.value
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
      data-export-hide
      class="fixed inset-0 z-[54] flex cursor-pointer flex-col items-center justify-center gap-[clamp(10px,2.2vh,28px)] overflow-hidden px-[6vw] text-center text-white"
      :class="up
        ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#18613f_0%,#0f2c1f_55%,#0a1712_100%)]'
        : 'bg-[radial-gradient(120%_90%_at_50%_0%,#6b241f_0%,#361513_55%,#170b0a_100%)]'"
      role="dialog"
      aria-modal="true"
      :aria-label="t(`markets.name.${shown.quote.key}`)"
      @click="dismiss()"
    >
      <span
        class="flex items-center gap-[0.5em] rounded-full border border-white/20 bg-white/10 px-[1.1em] py-[0.4em] font-bold tracking-[0.06em] text-[clamp(14px,2.2vh,26px)]"
      >
        <iconify-icon
          :icon="up ? 'mdi:trending-up' : 'mdi:trending-down'"
          aria-hidden="true"
          class="text-[1.3em]"
          :class="up ? 'text-accent-live' : 'text-down'"
        />
        {{ t(up ? 'markets.alert.up' : 'markets.alert.down') }}
      </span>

      <h2 class="m-0 font-extrabold leading-[1.1] text-balance break-words text-[clamp(30px,6.5vh,86px)]">
        {{ t(`markets.name.${shown.quote.key}`) }}
      </h2>

      <p class="m-0 flex items-baseline justify-center gap-[0.4em] font-extrabold tabular-nums text-[clamp(40px,9vh,120px)] leading-none">
        {{ price }}
        <span class="font-semibold text-white/60 text-[0.3em]">
          {{ shown.quote.currency }}<template v-if="shown.quote.unit"> / {{ t(`markets.unit.${shown.quote.unit}`) }}</template>
        </span>
      </p>

      <p
        class="m-0 font-extrabold tabular-nums text-[clamp(26px,5.5vh,70px)]"
        :class="up ? 'text-accent-live' : 'text-down'"
      >
        <!-- بدون عزل، علامة السالب بتتنقل لآخر النسبة في الاتجاه العربي -->
        <bdi dir="ltr">{{ move }}</bdi>
        <span class="ms-[0.4em] font-semibold text-white/50 text-[0.42em]">{{ t('markets.sinceClose') }}</span>
      </p>

      <Sparkline
        v-if="shown.quote.spark.length > 2"
        :points="shown.quote.spark"
        :up="up"
        class="h-[clamp(40px,8vh,110px)] w-[min(70vw,40rem)] opacity-80"
      />

      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div
          class="h-full transition-[width] duration-300 ease-linear"
          :class="up ? 'bg-accent-live' : 'bg-down'"
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
