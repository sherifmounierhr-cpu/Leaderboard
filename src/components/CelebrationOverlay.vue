<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useBoardData } from '@/composables/useBoardData'
import Avatar from './Avatar.vue'

/** مدة عرض كل احتفال قبل الانتقال للتالي في الطابور. */
const HOLD_MS = 8000
const PIECES = 28

const { t } = useI18n()
const { agents, celebrations, dismissCelebration } = useBoardData()

const current = computed(() => celebrations.value[0] ?? null)

/** المستشار قد يُحذف بين الكشف والعرض، فالعنصر قد يكون غير موجود. */
const agent = computed(() => {
  const id = current.value?.agentId
  return id ? (agents.value.find((a) => a.id === id) ?? null) : null
})

const rank = computed(() => {
  const id = current.value?.agentId
  if (!id) return 0
  return agents.value.findIndex((a) => a.id === id) + 1
})

const CONFETTI_COLORS = [
  'var(--color-accent)',
  'var(--color-accent-live)',
  'var(--color-gold)',
  'var(--color-accent-strong)',
]

/** تُعاد التوليدة مع كل احتفال جديد حتى لا تتكرر نفس القصاصات حرفياً. */
const pieces = computed(() => {
  void current.value?.key
  return Array.from({ length: PIECES }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    drift: `${(Math.random() - 0.5) * 28}vw`,
    delay: `${Math.random() * 2.4}s`,
    duration: `${2.6 + Math.random() * 1.6}s`,
    size: `${6 + Math.random() * 7}px`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    radius: i % 3 === 0 ? '50%' : '2px',
  }))
})

let timer: ReturnType<typeof setTimeout> | null = null

function clear() {
  if (timer) clearTimeout(timer)
  timer = null
}

// كل احتفال يبدأ مؤقّته الخاص؛ لو اختفى المستشار نمرّ للتالي فوراً
watch(
  () => current.value?.key,
  (key) => {
    clear()
    if (!key) return
    if (!agent.value) {
      dismissCelebration()
      return
    }
    timer = setTimeout(dismissCelebration, HOLD_MS)
  },
  { immediate: true },
)

onBeforeUnmount(clear)
</script>

<template>
  <Transition name="celebrate">
    <!-- data-export-hide: لا يظهر في صور PNG المصدَّرة -->
    <div
      v-if="current && agent"
      data-export-hide
      class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-header/80 px-5 backdrop-blur-sm"
    >
      <p class="sr-only" role="status" aria-live="polite">
        {{ t('celebrate.announce', { name: agent.name, amount: egp(current.amount) }) }}
      </p>

      <div data-confetti aria-hidden="true" class="pointer-events-none absolute inset-0">
        <span
          v-for="p in pieces"
          :key="p.id"
          class="absolute top-0 animate-confetti"
          :style="{
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.radius,
            animationDelay: p.delay,
            animationDuration: p.duration,
            '--drift': p.drift,
          }"
        />
      </div>

      <div
        class="animate-celebrate-in relative flex w-full max-w-lg flex-col items-center gap-5 rounded-3xl border border-accent/60 bg-card px-8 py-10 text-center shadow-[0_30px_80px_-30px_rgba(21,122,74,0.75)] ring-1 ring-accent/20"
      >
        <div
          class="flex items-center gap-2 rounded-full bg-accent-strong px-5 py-2 font-semibold tracking-[0.14em] text-white text-caption"
        >
          <iconify-icon icon="mdi:party-popper" aria-hidden="true" class="text-gold text-lg" />
          {{ t('celebrate.title') }}
        </div>

        <div class="relative">
          <span
            aria-hidden="true"
            class="animate-celebrate-halo absolute -inset-3 rounded-full bg-accent/25 blur-lg"
          />
          <Avatar
            :entity="agent"
            kind="agent"
            class="relative size-28 rounded-3xl text-4xl ring-4 ring-accent/70"
          />
        </div>

        <div class="flex flex-col gap-1">
          <div class="font-semibold text-strong text-[clamp(22px,3.4vh,30px)]">{{ agent.name }}</div>
          <div v-if="agent.team" class="font-medium text-mute text-note">
            {{ t('spotlight.ofTeam', { team: agent.team }) }}
          </div>
        </div>

        <div class="flex flex-col items-center gap-1" :title="egp(current.amount)">
          <span class="font-medium uppercase tracking-[0.16em] text-mute text-caption">
            {{ t('celebrate.amount') }}
          </span>
          <span
            class="font-bold leading-[0.9] tracking-[-0.02em] tabular-nums text-accent-text text-stat-2"
          >
            {{ compact(current.amount) }}
          </span>
        </div>

        <div
          class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-divider pt-4 w-full font-medium text-mute text-caption"
        >
          <span :title="egp(current.total)">
            {{ t('celebrate.newTotal') }}
            <b class="font-bold tabular-nums text-strong">{{ compact(current.total) }}</b>
          </span>
          <span v-if="rank > 0" class="tabular-nums">{{ t('celebrate.rank', { n: rank }) }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.celebrate-enter-active,
.celebrate-leave-active {
  transition: opacity 0.4s ease;
}
.celebrate-enter-from,
.celebrate-leave-to {
  opacity: 0;
}
</style>
