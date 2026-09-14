<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, egp } from '@/lib/format'
import { useBoardData, type BoardEntity } from '@/composables/useBoardData'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import Avatar from './Avatar.vue'

/** مدة عرض كل احتفال قبل الانتقال للتالي في الطابور. */
const HOLD_MS = 8000
const PIECES = 28

const { t } = useI18n()
const localName = useLocalName()
const { agents, year, quarter } = useBoardData()
const { celebrations, dismissCelebration } = useSaleEvents()

const current = computed(() => celebrations.value[0] ?? null)
const isManual = computed(() => current.value?.event.kind === 'manual')

/**
 * الحدث يحمل الاسم والصورة بنفسه، فالاحتفال يُعرض حتى لو المستشار خارج
 * الربع المعروض على اللوحة لحظتها.
 */
const agent = computed<BoardEntity | null>(() => {
  const e = current.value?.event
  if (!e) return null
  return {
    id: e.agent_id,
    name: localName(e.name, e.name_ar),
    team: e.team ? localName(e.team, e.team_ar) : '',
    photo: drivePhotoUrl(e.photo_url),
    deals: e.total_egp,
    target: 0,
    pct: 0,
  }
})

/** الترتيب يُذكر فقط لو الحدث من نفس الربع المعروض، وإلا لكان رقماً مضلِّلاً. */
const rank = computed(() => {
  const e = current.value?.event
  if (!e || e.year !== year.value || e.quarter !== quarter.value) return 0
  return agents.value.findIndex((a) => a.id === e.agent_id) + 1
})

/** الرقم الكبير: قيمة الصفقة للزيادة، والإجمالي للتهنئة اليدوية. */
const headline = computed(() => {
  const e = current.value?.event
  if (!e) return null
  if (e.kind === 'sale') return { label: t('celebrate.amount'), value: e.amount_egp }
  return e.total_egp > 0 ? { label: t('celebrate.newTotal'), value: e.total_egp } : null
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && current.value) dismissCelebration()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

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

// كل احتفال يبدأ مؤقّته الخاص
watch(
  () => current.value?.key,
  (key) => {
    clear()
    if (key) timer = setTimeout(dismissCelebration, HOLD_MS)
  },
  { immediate: true },
)

onBeforeUnmount(clear)
</script>

<template>
  <Transition name="celebrate">
    <!-- data-export-hide: لا يظهر في صور PNG المصدَّرة -->
    <!-- النقر في أي مكان أو Esc يغلق الاحتفال مبكراً -->
    <div
      v-if="current && agent"
      data-export-hide
      class="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center overflow-hidden bg-header/80 px-5 backdrop-blur-sm"
      @click="dismissCelebration"
    >
      <p class="sr-only" role="status" aria-live="polite">
        {{
          isManual
            ? t('celebrate.announceManual', { name: agent.name })
            : t('celebrate.announce', { name: agent.name, amount: egp(current.event.amount_egp) })
        }}
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
          <iconify-icon
            :icon="isManual ? 'mdi:trophy' : 'mdi:party-popper'"
            aria-hidden="true"
            class="text-gold text-lg"
          />
          {{ isManual ? t('celebrate.manualTitle') : t('celebrate.title') }}
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

        <p
          v-if="current.event.note"
          class="m-0 max-w-full break-words font-semibold leading-snug text-strong text-[clamp(18px,2.6vh,24px)]"
        >“{{ current.event.note }}”</p>

        <div v-if="headline" class="flex flex-col items-center gap-1" :title="egp(headline.value)">
          <span class="font-medium uppercase tracking-[0.16em] text-mute text-caption">
            {{ headline.label }}
          </span>
          <span
            class="font-bold leading-[0.9] tracking-[-0.02em] tabular-nums text-accent-text text-stat-2"
          >
            {{ compact(headline.value) }}
          </span>
        </div>

        <div
          v-if="!isManual || rank > 0"
          class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-divider pt-4 w-full font-medium text-mute text-caption"
        >
          <span v-if="!isManual" :title="egp(current.event.total_egp)">
            {{ t('celebrate.newTotal') }}
            <b class="font-bold tabular-nums text-strong">{{ compact(current.event.total_egp) }}</b>
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
