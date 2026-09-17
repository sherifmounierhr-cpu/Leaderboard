<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, egp } from '@/lib/format'
import { useBoardData, type BoardEntity } from '@/composables/useBoardData'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import Avatar from './Avatar.vue'

/** كثافة تُقرأ احتفالاً على شاشة 1920 من بعيد، لا نقاطاً متناثرة. */
const PIECES = 64

const { t } = useI18n()
const localName = useLocalName()
const { agents, year, quarter } = useBoardData()
const { celebrations, dismissCelebration } = useSaleEvents()
const { settings, urlOf } = useBoardMedia()
const { play, stop } = useAudioPlayer()

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
  // التهنئة قد تُعاد لاحقاً من الإشعارات، فلا نقول «الآن» عن رقم وقت إرسالها
  return e.total_egp > 0 ? { label: t('celebrate.total'), value: e.total_egp } : null
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && current.value) close()
}

function close() {
  stop()
  dismissCelebration()
}

/** مدة الاحتفال: الخاصة بالتهنئة لو اتحددت، وإلا مدة الإعدادات. */
const holdSeconds = computed(() => current.value?.event.duration_s ?? settings.value.celebration_seconds)

/** الأغنية: المختارة للتهنئة، وإلا الافتراضية — إلا لو «بدون صوت». */
const songUrl = computed(() => {
  const e = current.value?.event
  if (!e || e.mute) return null
  return urlOf(e.song_id) ?? urlOf(settings.value.celebration_song_id)
})
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
    size: `clamp(${7 + Math.random() * 5}px, ${0.8 + Math.random() * 0.9}vw, ${14 + Math.random() * 12}px)`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    radius: i % 3 === 0 ? '50%' : '2px',
  }))
})

let timer: ReturnType<typeof setTimeout> | null = null
const startedAt = ref(0)
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

function clear() {
  if (timer) clearTimeout(timer)
  timer = null
}

// كل احتفال يبدأ مؤقّته وأغنيته
watch(
  () => current.value?.key,
  (key) => {
    clear()
    stop()
    if (!key) return
    startedAt.value = Date.now()
    timer = setTimeout(close, holdSeconds.value * 1000)
    if (songUrl.value) void play(songUrl.value, settings.value.volume, holdSeconds.value)
  },
  { immediate: true },
)

/** الوقت الباقي كشريط تحت البطاقة. */
const progress = computed(() => {
  if (!current.value) return 0
  return Math.min(100, ((now.value - startedAt.value) / (holdSeconds.value * 1000)) * 100)
})

onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 200) })
onBeforeUnmount(() => {
  clear()
  stop()
  if (clock) clearInterval(clock)
})
</script>

<template>
  <Transition name="celebrate">
    <!-- data-export-hide: لا يظهر في صور PNG المصدَّرة -->
    <!-- النقر في أي مكان أو Esc يغلق الاحتفال مبكراً -->
    <div
      v-if="current && agent"
      data-export-hide
      class="fixed inset-0 z-[60] flex cursor-pointer items-center justify-center overflow-hidden bg-header/80 px-5 backdrop-blur-sm"
      @click="close"
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

      <!--
        المقاسات بـ vh: الاحتفال يُقرأ من آخر المكتب على التلفزيون، فيكبر مع
        ارتفاع الشاشة بدل أن يبقى بطاقة صغيرة وسط 1920 بكسل.
      -->
      <div
        class="animate-celebrate-in relative flex w-full max-w-[min(92vw,44rem)] lg:max-w-[clamp(34rem,50vw,58rem)] flex-col items-center gap-[clamp(14px,2.4vh,30px)] rounded-[clamp(20px,3vh,40px)] border border-accent/60 bg-card px-[clamp(24px,4vh,64px)] py-[clamp(28px,4.8vh,64px)] text-center shadow-[0_30px_80px_-30px_rgba(21,122,74,0.75)] ring-1 ring-accent/20"
      >
        <div
          class="flex items-center gap-[0.5em] rounded-full bg-accent-strong px-[1.2em] py-[0.45em] font-bold tracking-[0.08em] text-white text-[clamp(14px,2.2vh,26px)]"
        >
          <iconify-icon
            :icon="isManual ? 'mdi:trophy' : 'mdi:party-popper'"
            aria-hidden="true"
            class="text-gold text-[1.3em]"
          />
          {{ isManual ? t('celebrate.manualTitle') : t('celebrate.title') }}
        </div>

        <div class="relative">
          <span
            aria-hidden="true"
            class="animate-celebrate-halo absolute -inset-[8%] rounded-full bg-accent/25 blur-xl"
          />
          <Avatar
            :entity="agent"
            kind="agent"
            class="relative size-[clamp(7rem,20vh,14rem)] rounded-[22%] text-[clamp(2.25rem,6vh,4.5rem)] ring-[clamp(3px,0.5vh,6px)] ring-accent/70"
          />
        </div>

        <div class="flex flex-col gap-[0.25em] max-w-full">
          <div class="font-bold leading-tight text-strong text-[clamp(26px,5.2vh,62px)] break-words">
            {{ agent.name }}
          </div>
          <div v-if="agent.team" class="font-medium text-mute text-[clamp(15px,2.6vh,30px)]">
            {{ t('spotlight.ofTeam', { team: agent.team }) }}
          </div>
        </div>

        <!--
          بلا علامات تنصيص: الرسالة قد تكون إنجليزية داخل صفحة عربية فتنقلب
          العلامات حولها (”Good One“). dir="auto" يضبط اتجاه الرسالة نفسها.
        -->
        <p
          v-if="current.event.note"
          dir="auto"
          class="m-0 flex max-w-full items-start gap-[0.4em] rounded-2xl bg-accent/10 px-[0.9em] py-[0.5em] break-words font-semibold leading-snug text-strong text-[clamp(18px,3.4vh,40px)]"
        >
          <iconify-icon icon="mdi:format-quote-open" aria-hidden="true" class="shrink-0 text-accent-text text-[1.1em]" />
          <span>{{ current.event.note }}</span>
        </p>

        <div v-if="headline" class="flex flex-col items-center gap-[0.4em]" :title="egp(headline.value)">
          <span class="font-semibold tracking-[0.06em] text-mute text-[clamp(14px,2.3vh,28px)]">
            {{ headline.label }}
          </span>
          <span
            class="font-bold leading-[0.9] tracking-[-0.02em] tabular-nums text-accent-text text-[clamp(3rem,12vh,9rem)]"
          >
            {{ compact(headline.value) }}
          </span>
        </div>

        <div
          v-if="!isManual || rank > 0"
          class="flex flex-wrap items-center justify-center gap-x-[1.5em] gap-y-1 border-t border-divider pt-[0.8em] w-full font-medium text-mute text-[clamp(15px,2.6vh,30px)]"
        >
          <span v-if="!isManual" :title="egp(current.event.total_egp)">
            {{ t('celebrate.newTotal') }}
            <b class="font-bold tabular-nums text-strong">{{ compact(current.event.total_egp) }}</b>
          </span>
          <span v-if="rank > 0" class="font-bold tabular-nums text-strong">{{ t('celebrate.rank', { n: rank }) }}</span>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div class="h-full bg-gold transition-[width] duration-200 ease-linear" :style="{ width: `${progress}%` }" />
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
