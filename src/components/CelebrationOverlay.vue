<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, egp } from '@/lib/format'
import { useBoardData, type BoardEntity } from '@/composables/useBoardData'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import Avatar from './Avatar.vue'

/** كثافة تُقرأ احتفالاً على شاشة 1920 من بعيد، لا نقاطاً متناثرة. */
const PIECES = 64

const { t } = useI18n()
const localName = useLocalName()
const { agents, teams, year, quarter } = useBoardData()
const { celebrations, dismissCelebration } = useSaleEvents()
const { settings, urlOf } = useBoardMedia()
const { play, stop } = useAudioPlayer()

const current = computed(() => celebrations.value[0] ?? null)
const isTeam = computed(() => current.value?.scope === 'team')
/** يدوي أو احتفال نهاية ربع — نفس شارة "الكأس"، بخلاف زيادة مبيعات مكتشفة تلقائياً. */
const isManual = computed(() => {
  const c = current.value
  return c?.scope === 'agent' && (c.event.kind === 'manual' || c.event.kind === 'quarter')
})

/**
 * الحدث يحمل الاسم والصورة بنفسه، فالاحتفال يُعرض حتى لو المستشار خارج
 * الربع المعروض على اللوحة لحظتها.
 */
const agent = computed<BoardEntity | null>(() => {
  const c = current.value
  if (!c || c.scope !== 'agent') return null
  const e = c.event
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

/** بطاقة الفريق: اسمه وصورته، لاحتفال نهاية الربع. */
const team = computed<BoardEntity | null>(() => {
  const c = current.value
  if (!c || c.scope !== 'team') return null
  const e = c.event
  return {
    id: e.team_id,
    name: localName(e.name, e.name_ar),
    photo: drivePhotoUrl(e.photo_url),
    deals: e.total_egp,
    target: 0,
    pct: 0,
  }
})

/** مديرو الفريق — كل واحد على جنب، مش مجمّعين صغيرين تحت الاسم. */
const teamManagers = computed<BoardEntity[]>(() => {
  const c = current.value
  if (!c || c.scope !== 'team') return []
  return c.event.managers.map((m) => ({
    id: m.id,
    name: localName(m.name, m.name_ar),
    photo: drivePhotoUrl(m.photo_url),
    deals: 0,
    target: 0,
    pct: 0,
  }))
})
/** أول مديرين بس ياخدوا جنب — الباقي (نادر) يفضلوا في صف صغير أسفل الاسم. */
const sideManagers = computed(() => teamManagers.value.slice(0, 2))
const extraManagers = computed(() => teamManagers.value.slice(2))

/*
 * الاحتفال أعلى الأولويات، فما بيستناش حد — بس بيسجّل دوره عشان الشاشات
 * التانية تعرف إنها تستنى وراه.
 */
useOverlayLayer('celebration', computed(() => Boolean(current.value && (agent.value || team.value))))

/** الترتيب يُذكر فقط لو الحدث من نفس الربع المعروض، وإلا لكان رقماً مضلِّلاً. */
const rank = computed(() => {
  const c = current.value
  if (!c || c.event.year !== year.value || c.event.quarter !== quarter.value) return 0
  if (c.scope === 'agent') return agents.value.findIndex((a) => a.id === c.event.agent_id) + 1
  return teams.value.find((t) => t.id === c.event.team_id)?.rank ?? 0
})
/** الأول مميَّز — تاج بدل ميدالية، وتوهّج حوالين الشاشة. الاحتفالات بتتصاعد من الأقل للأعلى فيُختم به. */
const isChampion = computed(() => rank.value === 1)

/** صورة البطاقة بملء الشاشة: صورة الفريق أو المستشار، وإلا خلفية متدرّجة. */
const photoUrl = computed(() => team.value?.photo || agent.value?.photo || '')
const imgBroken = ref(false)

/** الرقم الكبير: قيمة الصفقة للزيادة، والإجمالي لباقي الأنواع. */
const headline = computed(() => {
  const c = current.value
  if (!c) return null
  const e = c.event
  if (c.scope === 'agent' && e.kind === 'sale') return { label: t('celebrate.amount'), value: e.amount_egp }
  // التهنئة قد تُعاد لاحقاً من الإشعارات، فلا نقول «الآن» عن رقم وقت إرسالها
  return e.total_egp > 0 ? { label: t('celebrate.total'), value: e.total_egp } : null
})

/** زيادة مبيعات مكتشفة تلقائياً فقط — بخلاف اليدوي واحتفال نهاية الربع وبطاقة الفريق. */
const isSale = computed(() => current.value?.scope === 'agent' && current.value.event.kind === 'sale')

const announceText = computed(() => {
  const c = current.value
  if (!c) return ''
  if (c.scope === 'team') return t('celebrate.announceTeam', { name: team.value?.name ?? '' })
  if (isSale.value) return t('celebrate.announce', { name: agent.value?.name ?? '', amount: egp(c.event.amount_egp) })
  return t('celebrate.announceManual', { name: agent.value?.name ?? '' })
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
    imgBroken.value = false
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
      v-if="current && (agent || team)"
      data-export-hide
      role="dialog"
      aria-modal="true"
      :aria-label="announceText"
      class="fixed inset-0 z-[60] flex cursor-pointer overflow-hidden bg-header"
      :class="isChampion ? 'celebrate-champion-ring' : ''"
      @click="close"
    >
      <p class="sr-only" role="status" aria-live="polite">{{ announceText }}</p>

      <!--
        الفرد: تركيز الصورة على الجزء العلوي (الوش)، والكلام يبقى في الجنب
        التاني بدل ما يغطّي الصورة. الفريق: الصورة مركزية زي شعار، والكلام
        في النص لأن مديري الفريق بياخدوا الجنبين.
      -->
      <img
        v-if="photoUrl && !imgBroken"
        :src="photoUrl"
        alt=""
        referrerpolicy="no-referrer"
        class="celebrate-zoom absolute inset-0 size-full object-cover"
        :class="isTeam ? 'object-center' : 'object-top'"
        @error="imgBroken = true"
      />
      <div
        v-else
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(135deg,var(--color-accent-strong),var(--color-accent))]"
      />

      <!-- تدرّج جانبي للفرد (الكلام في جنبه)، وتدرّج علوي-سفلي للفريق (الكلام في النص) -->
      <span
        v-if="!isTeam"
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,14,18,0.95)_0%,rgba(10,14,18,0.86)_30%,rgba(10,14,18,0.4)_54%,rgba(10,14,18,0.08)_72%)] rtl:bg-[linear-gradient(to_left,rgba(10,14,18,0.95)_0%,rgba(10,14,18,0.86)_30%,rgba(10,14,18,0.4)_54%,rgba(10,14,18,0.08)_72%)]"
      />
      <span
        v-else
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,14,18,0.94)_0%,rgba(10,14,18,0.78)_26%,rgba(10,14,18,0.25)_55%,rgba(10,14,18,0.45)_100%)]"
      />
      <!-- ظل سفلي خفيف يفضل حتى مع تدرّج الفرد الجانبي، لوضوح شريط الوقت -->
      <span v-if="!isTeam" aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[26vh] bg-gradient-to-t from-black/75 to-transparent" />

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

      <!-- مديرو الفريق: كل واحد على جنب، بحجم كبير — للفريق فقط -->
      <div
        v-for="(m, i) in sideManagers"
        :key="m.id"
        class="absolute inset-y-0 flex w-[min(30vw,22rem)] flex-col items-center justify-center gap-[1em] px-[1.5vw]"
        :class="i === 0 ? 'start-0' : 'end-0'"
      >
        <Avatar
          :entity="m"
          kind="agent"
          class="size-[clamp(9rem,26vh,17rem)] rounded-[1.6rem] text-[clamp(2rem,5vh,3.6rem)] shadow-[0_18px_48px_-14px_rgba(0,0,0,0.7)] ring-[3px] ring-white/70"
        />
        <span class="max-w-full truncate font-bold text-white text-[clamp(15px,2.3vh,26px)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
          {{ m.name }}
        </span>
      </div>

      <!--
        الترتيب أعلى الشاشة في النص — للفريق فقط، لأن مافيش وش هناك يتغطّى.
        للفرد الشارة بتتحط في عمود النص بدل ما تتحط فوق وشه في نص الشاشة.
      -->
      <div v-if="isTeam && rank > 0" class="absolute inset-x-0 top-[6vh] flex justify-center">
        <span
          class="flex items-center gap-[0.45em] rounded-full bg-gold font-extrabold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)]"
          :class="isChampion
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.65em] text-[clamp(22px,4.4vh,60px)]'
            : 'px-[1.3em] py-[0.55em] text-[clamp(18px,3.6vh,50px)]'"
        >
          <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
          {{ t('celebrate.rank', { n: rank }) }}
        </span>
      </div>

      <!--
        المقاسات بـ vh: الاحتفال يُقرأ من آخر المكتب على التلفزيون، فيكبر مع
        ارتفاع الشاشة بدل أن يبقى بطاقة صغيرة وسط 1920 بكسل.
        الفرد: عمود في الجنب المناسب (يتبع اتجاه اللغة) بعرض محدود فما يغطّيش
        الوش. الفريق: في النص، لأن الجنبين محجوزين لمديريه.
      -->
      <div
        class="animate-celebrate-in relative flex h-full flex-col gap-[clamp(12px,2.2vh,26px)] py-[6vh] text-white"
        :class="isTeam
          ? 'w-full items-center justify-center px-[6vw] text-center'
          : 'w-[min(60vw,44rem)] items-start justify-end ps-[6vw] pe-[3vw] pb-[clamp(40px,8vh,100px)] text-start'"
      >
        <!-- ترتيب الفرد هنا في عمود النص، لا فوق وشه في نص الشاشة -->
        <span
          v-if="!isTeam && rank > 0"
          class="flex items-center gap-[0.45em] self-start rounded-full bg-gold font-extrabold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)]"
          :class="isChampion
            ? 'celebrate-rank-pulse px-[1.4em] py-[0.6em] text-[clamp(20px,3.4vh,46px)]'
            : 'px-[1.2em] py-[0.5em] text-[clamp(16px,2.8vh,38px)]'"
        >
          <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
          {{ t('celebrate.rank', { n: rank }) }}
        </span>

        <div
          class="flex items-center gap-[0.5em] rounded-full bg-accent-strong px-[1.2em] py-[0.45em] font-bold tracking-[0.08em] text-[clamp(14px,2.2vh,26px)]"
        >
          <iconify-icon
            :icon="isSale ? 'mdi:party-popper' : 'mdi:trophy'"
            aria-hidden="true"
            class="text-gold text-[1.3em]"
          />
          {{ isTeam ? t('celebrate.teamTitle') : isManual ? t('celebrate.manualTitle') : t('celebrate.title') }}
        </div>

        <div
          class="max-w-[22ch] font-extrabold leading-[1.05] tracking-[-0.01em] text-balance break-words drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)] text-[clamp(34px,8vh,100px)]"
        >
          {{ team?.name ?? agent?.name }}
        </div>
        <div v-if="agent?.team" class="font-medium text-white/80 text-[clamp(16px,2.8vh,32px)]">
          {{ t('spotlight.ofTeam', { team: agent.team }) }}
        </div>

        <!-- مديرون إضافيون نادرون (أكتر من اتنين) — صف صغير بعد الاسم -->
        <div v-if="extraManagers.length" class="flex flex-wrap items-center justify-center gap-[1em] max-w-full">
          <div v-for="m in extraManagers" :key="m.id" class="flex flex-col items-center gap-[0.3em]">
            <Avatar
              :entity="m"
              kind="agent"
              class="size-[clamp(2.6rem,7vh,4.6rem)] rounded-full text-[clamp(0.9rem,2vh,1.4rem)] ring-2 ring-white/60"
            />
            <span class="font-semibold text-white/85 text-[clamp(11px,1.6vh,16px)] max-w-[10ch] truncate">{{ m.name }}</span>
          </div>
        </div>

        <!--
          بلا علامات تنصيص: الرسالة قد تكون إنجليزية داخل صفحة عربية فتنقلب
          العلامات حولها (”Good One“). dir="auto" يضبط اتجاه الرسالة نفسها.
        -->
        <p
          v-if="current.event.note"
          dir="auto"
          class="m-0 flex max-w-[60ch] items-start gap-[0.4em] rounded-2xl bg-black/35 px-[1em] py-[0.6em] break-words font-semibold leading-snug text-[clamp(18px,3.2vh,38px)]"
        >
          <iconify-icon icon="mdi:format-quote-open" aria-hidden="true" class="shrink-0 text-gold text-[1.1em]" />
          <span>{{ current.event.note }}</span>
        </p>

        <div :class="isTeam ? 'flex flex-col items-center gap-[0.3em]' : 'flex flex-col items-start gap-[0.3em]'" v-if="headline" :title="egp(headline.value)">
          <span class="font-semibold tracking-[0.06em] text-white/70 text-[clamp(14px,2.3vh,26px)]">
            {{ headline.label }}
          </span>
          <span
            class="font-extrabold leading-[0.9] tracking-[-0.02em] tabular-nums text-gold text-[clamp(3rem,13vh,10rem)]"
          >
            {{ compact(headline.value) }}
          </span>
        </div>

        <div v-if="isSale" class="font-medium text-white/70 text-[clamp(15px,2.4vh,28px)]" :title="egp(current!.event.total_egp)">
          {{ t('celebrate.newTotal') }}
          <b class="font-bold tabular-nums text-white">{{ compact(current!.event.total_egp) }}</b>
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
/* زوم بطيء جداً يدّي الصورة الساكنة إحساس بالحياة على الشاشة — زي الخبر العاجل */
.celebrate-zoom {
  animation: celebrate-zoom 20s ease-out both;
}
@keyframes celebrate-zoom {
  from { transform: scale(1.06); }
  to { transform: scale(1.14); }
}
@media (prefers-reduced-motion: reduce) {
  .celebrate-zoom { animation: none; }
}

/* الأول: توهّج ذهبي نابض حوالين حواف الشاشة، وميدالية أكبر تنبض شوية. */
.celebrate-champion-ring {
  box-shadow: inset 0 0 0 clamp(4px, 0.6vh, 10px) var(--color-gold);
  animation: celebrate-champion-glow 2.4s ease-in-out infinite;
}
@keyframes celebrate-champion-glow {
  0%, 100% { box-shadow: inset 0 0 clamp(20px, 3vh, 50px) 0 color-mix(in oklab, var(--color-gold) 55%, transparent); }
  50% { box-shadow: inset 0 0 clamp(40px, 6vh, 100px) 0 color-mix(in oklab, var(--color-gold) 85%, transparent); }
}
.celebrate-rank-pulse {
  animation: celebrate-rank-pulse 1.8s ease-in-out infinite;
}
@keyframes celebrate-rank-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@media (prefers-reduced-motion: reduce) {
  .celebrate-champion-ring, .celebrate-rank-pulse { animation: none; }
}
</style>
