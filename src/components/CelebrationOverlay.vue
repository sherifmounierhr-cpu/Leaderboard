<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, egp } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { supabase } from '@/lib/supabase'
import type { AgentStanding, TeamStanding } from '@/lib/types'
import Avatar from './Avatar.vue'

/** كثافة تُقرأ احتفالاً على شاشة 1920 من بعيد، لا نقاطاً متناثرة. */
const PIECES = 64

const { t } = useI18n()
const localName = useLocalName()
const { celebrations, dismissCelebration } = useSaleEvents()
const { settings, urlOf } = useBoardMedia()
const { play, stop } = useAudioPlayer()

const current = computed(() => celebrations.value[0] ?? null)
const isTeam = computed(() => current.value?.scope === 'team')
const isIntro = computed(() => current.value?.scope === 'intro')
const isDivider = computed(() => current.value?.scope === 'divider')
const isRanking = computed(() => current.value?.scope === 'ranking')
/** قسم البطاقة الفاصلة أو جدول الترتيب الحالي: فرق أو أفراد. */
const section = computed(() => {
  const c = current.value
  return c && (c.scope === 'divider' || c.scope === 'ranking') ? c.event.section : null
})
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

/**
 * مديرو الفريق واقفين فوق صورة فريقهم: الصورة المعزولة لو اتعملت من
 * الإدارة، وإلا الصورة الأصلية في إطار (احتياطي لحد ما تتعزل).
 */
interface ManagerFigure extends BoardEntity { cutout: string }
const teamManagers = computed<ManagerFigure[]>(() => {
  const c = current.value
  if (!c || c.scope !== 'team') return []
  return c.event.managers.map((m) => ({
    id: m.id,
    name: localName(m.name, m.name_ar),
    photo: drivePhotoUrl(m.photo_url),
    cutout: m.cutout_url ?? '',
    deals: 0,
    target: 0,
    pct: 0,
  }))
})
/** مدير واحد ياخد نص الشاشة؛ اتنين ياخدوا الجنبين؛ الباقي (نادر) يقفوا جنبهم أصغر. */
const heroManager = computed(() => (teamManagers.value.length === 1 ? teamManagers.value[0] : null))
const sideManagers = computed(() => (heroManager.value ? [] : teamManagers.value.slice(0, 2)))
const extraManagers = computed(() => teamManagers.value.slice(2))

/** افتتاحية الاحتفال: كلمة الإدارة وصور المديرين — مرة واحدة قبل الفرق. */
interface IntroPerson { id: string; name: string; title: string; photo: string }
const introDirectors = computed<IntroPerson[]>(() => {
  const c = current.value
  if (!c || c.scope !== 'intro') return []
  return c.event.directors.map((d) => ({
    id: d.id,
    name: localName(d.name, d.name_ar),
    title: d.title ? localName(d.title, d.title_ar) : '',
    photo: drivePhotoUrl(d.photo_url),
  }))
})
const introMessage = computed(() => (current.value?.scope === 'intro' ? current.value.event.message : null))

/**
 * ترتيب الفرق والأفراد لربع الاحتفال نفسه — لا ربع اللوحة المعروض حالياً،
 * فقد يُطلق المسؤول احتفال ربع ماضٍ واللوحة بالفعل بدّلت لربع جديد. تُجلب
 * مرة لكل ربع ويُحتفظ بها هنا طوال الدفعة.
 */
interface RankingRow { id: string; rank: number; name: string; photo: string; deals: number; target: number; pct: number }
const standingsCache = ref(new Map<string, { teams: RankingRow[]; agents: RankingRow[] }>())

function standingsKey(y: number, q: number) {
  return `${y}:${q}`
}

async function ensureStandings(y: number, q: number) {
  const key = standingsKey(y, q)
  if (standingsCache.value.has(key)) return
  const [teamRes, agentRes] = await Promise.all([
    supabase.from('lb_team_standings').select('*').eq('year', y).eq('quarter', q).order('rank', { ascending: true }),
    supabase.from('lb_agent_standings').select('*').eq('year', y).eq('quarter', q).order('rank', { ascending: true }),
  ])
  const teamRows = ((teamRes.data ?? []) as TeamStanding[])
    .filter((row) => Number(row.deals) > 0)
    .map((row) => ({
      id: row.team_id,
      rank: row.rank,
      name: localName(row.name, row.name_ar),
      photo: drivePhotoUrl(row.photo_url),
      deals: Number(row.deals) || 0,
      target: 0,
      pct: 0,
    }))
  // الجدول والترتيب للي حققوا مبيعات بس — اللي على صفر ما يظهروش
  const agentRows = ((agentRes.data ?? []) as AgentStanding[]).filter((row) => Number(row.deals) > 0).map((row) => ({
    id: row.agent_id,
    rank: row.rank,
    name: localName(row.name, row.name_ar),
    photo: drivePhotoUrl(row.photo_url),
    deals: Number(row.deals) || 0,
    target: 0,
    pct: 0,
  }))
  const next = new Map(standingsCache.value)
  next.set(key, { teams: teamRows, agents: agentRows })
  standingsCache.value = next
}

watch(
  () => current.value,
  (c) => {
    if (c && (c.scope === 'agent' || c.scope === 'team' || c.scope === 'divider' || c.scope === 'ranking')) {
      void ensureStandings(c.event.year, c.event.quarter)
    }
  },
  { immediate: true },
)

/** جدول الترتيب بعد كل قسم: الفرق أو الأفراد، من ترتيب ربع الاحتفال نفسه. */
const rankingList = computed<RankingRow[]>(() => {
  const c = current.value
  if (!c || c.scope !== 'ranking') return []
  const snap = standingsCache.value.get(standingsKey(c.event.year, c.event.quarter))
  if (!snap) return []
  return c.event.section === 'team' ? snap.teams : snap.agents
})

/*
 * الاحتفال أعلى الأولويات، فما بيستناش حد — بس بيسجّل دوره عشان الشاشات
 * التانية تعرف إنها تستنى وراه.
 */
useOverlayLayer(
  'celebration',
  computed(() => Boolean(current.value && (agent.value || team.value || isIntro.value || isDivider.value || isRanking.value))),
)

/** الترتيب من ترتيب ربع الحدث نفسه (مجلوب أعلاه)، لا ربع اللوحة المعروض. لا ترتيب للافتتاحية أو البطاقات المحلية. */
const rank = computed(() => {
  const c = current.value
  if (!c || c.scope === 'intro' || c.scope === 'divider' || c.scope === 'ranking') return 0
  const snap = standingsCache.value.get(standingsKey(c.event.year, c.event.quarter))
  if (!snap) return 0
  if (c.scope === 'agent') return snap.agents.find((a) => a.id === c.event.agent_id)?.rank ?? 0
  return snap.teams.find((t) => t.id === c.event.team_id)?.rank ?? 0
})
/** الأول مميَّز — تاج بدل ميدالية، وتوهّج حوالين الشاشة. الاحتفالات بتتصاعد من الأقل للأعلى فيُختم به. */
const isChampion = computed(() => rank.value === 1)

/** صورة البطاقة بملء الشاشة: صورة الفريق أو المستشار، وإلا خلفية متدرّجة. */
const photoUrl = computed(() => team.value?.photo || agent.value?.photo || '')
const imgBroken = ref(false)

/** الرقم الكبير: قيمة الصفقة للزيادة، والإجمالي لباقي الأنواع — لا رقم للافتتاحية أو البطاقات المحلية. */
const headline = computed(() => {
  const c = current.value
  if (!c || c.scope === 'intro' || c.scope === 'divider' || c.scope === 'ranking') return null
  const e = c.event
  if (c.scope === 'agent' && e.kind === 'sale') return { label: t('celebrate.amount'), value: e.amount_egp }
  // التهنئة قد تُعاد لاحقاً من الإشعارات، فلا نقول «الآن» عن رقم وقت إرسالها
  return e.total_egp > 0 ? { label: t('celebrate.total'), value: e.total_egp } : null
})

/** زيادة مبيعات مكتشفة تلقائياً فقط — بخلاف اليدوي واحتفال نهاية الربع وبطاقة الفريق. */
const isSale = computed(() => current.value?.scope === 'agent' && current.value.event.kind === 'sale')
/** إجمالي مبيعات المستشار — لسطر "الإجمالي الآن" عند صفقة مكتشفة تلقائياً فقط. */
const saleEventTotal = computed(() => {
  const c = current.value
  return c && c.scope === 'agent' ? c.event.total_egp : 0
})
/** الرسالة أو الملاحظة — note للفرد/الفريق فقط، لا شيء لباقي الأنواع. */
const noteText = computed(() => {
  const c = current.value
  if (!c || (c.scope !== 'agent' && c.scope !== 'team')) return null
  return c.event.note
})

const announceText = computed(() => {
  const c = current.value
  if (!c) return ''
  if (c.scope === 'intro') return t('celebrate.announceIntro')
  if (c.scope === 'divider') return t(c.event.section === 'team' ? 'celebrate.announceDividerTeam' : 'celebrate.announceDividerAgent')
  if (c.scope === 'ranking') return t(c.event.section === 'team' ? 'celebrate.announceRankingTeam' : 'celebrate.announceRankingAgent')
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
      v-if="current && (agent || team || isIntro || isDivider || isRanking)"
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

      <!--
        تدرّج جانبي للفرد (الكلام في جنبه)، وتدرّج علوي-سفلي للفريق والافتتاحية
        (الكلام في النص، مالياً عرض الشاشة).
      -->
      <span
        v-if="!isTeam && !isIntro && !isDivider && !isRanking"
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_right,rgba(10,14,18,0.95)_0%,rgba(10,14,18,0.86)_30%,rgba(10,14,18,0.4)_54%,rgba(10,14,18,0.08)_72%)] rtl:bg-[linear-gradient(to_left,rgba(10,14,18,0.95)_0%,rgba(10,14,18,0.86)_30%,rgba(10,14,18,0.4)_54%,rgba(10,14,18,0.08)_72%)]"
      />
      <span
        v-else
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(10,14,18,0.94)_0%,rgba(10,14,18,0.78)_26%,rgba(10,14,18,0.25)_55%,rgba(10,14,18,0.45)_100%)]"
      />
      <!-- ظل سفلي خفيف يفضل حتى مع تدرّج الفرد الجانبي، لوضوح شريط الوقت -->
      <span v-if="!isTeam && !isIntro && !isDivider && !isRanking" aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[26vh] bg-gradient-to-t from-black/75 to-transparent" />

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

      <!-- مدير واحد: الكلام في النص التاني، فنغمّق ناحيته شوية لوضوحه -->
      <span
        v-if="heroManager"
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_left,rgba(10,14,18,0.78)_0%,rgba(10,14,18,0.35)_45%,transparent_65%)] rtl:bg-[linear-gradient(to_right,rgba(10,14,18,0.78)_0%,rgba(10,14,18,0.35)_45%,transparent_65%)]"
      />

      <!--
        مديرو الفريق واقفين على أرض صورة فريقهم (مقصوصين بلا خلفية): واحد ياخد
        نص الشاشة، اتنين ياخدوا الجنبين. تحت كل واحد لوحة باسمه وترتيب فريقه.
      -->
      <div
        v-for="(m, i) in heroManager ? [heroManager] : sideManagers"
        :key="m.id"
        class="pointer-events-none absolute bottom-0 flex items-end justify-center"
        :class="heroManager
          ? 'start-[2vw] h-[92vh] w-[46vw]'
          : ['h-[80vh] w-[30vw]', i === 0 ? 'start-[1vw]' : 'end-[1vw]']"
      >
        <img
          v-if="m.cutout"
          :src="m.cutout"
          alt=""
          class="celebrate-figure size-full object-contain object-bottom"
        />
        <!-- لسه ما اتعزلتش من الإدارة: الصورة الأصلية في إطار، مش مربع صغير -->
        <div
          v-else
          class="ranking-face mb-[16vh] aspect-[4/5] rounded-[1.8rem] bg-avatar shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-[3px] ring-white/70"
          :class="heroManager ? 'w-[min(32vw,34rem)]' : 'w-[min(22vw,24rem)]'"
          :style="m.photo ? { backgroundImage: `url('${m.photo}')` } : undefined"
        />

        <div class="absolute inset-x-0 bottom-[4vh] flex justify-center">
          <span
            class="flex max-w-[92%] items-center gap-[0.55em] rounded-full bg-black/55 py-[0.35em] ps-[0.4em] pe-[1.1em] text-white shadow-[0_12px_32px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/15 backdrop-blur-md"
            :class="heroManager ? 'text-[clamp(18px,3vh,36px)]' : 'text-[clamp(15px,2.4vh,28px)]'"
          >
            <span
              v-if="rank > 0"
              class="flex shrink-0 items-center gap-[0.25em] rounded-full bg-gold px-[0.65em] py-[0.15em] font-display font-bold text-header"
              :class="isChampion ? 'celebrate-rank-pulse' : ''"
            >
              <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
              {{ rank }}
            </span>
            <span class="truncate font-display font-bold">{{ m.name }}</span>
          </span>
        </div>
      </div>

      <!--
        ترتيب الفريق كبير أعلى الشاشة في النص — لما الكلام في النص (مديرين
        على الجنبين أو مافيش مدير). مع مدير واحد بيتحط أعلى عمود الكلام.
      -->
      <div v-if="isTeam && !heroManager && rank > 0" class="absolute inset-x-0 top-[6vh] flex justify-center">
        <span
          class="flex items-center gap-[0.45em] rounded-full bg-gold font-display font-bold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)] [word-spacing:0.25em]"
          :class="isChampion
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.65em] text-[clamp(22px,4.4vh,60px)]'
            : 'px-[1.3em] py-[0.55em] text-[clamp(18px,3.6vh,50px)]'"
        >
          <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
          {{ t('celebrate.rank', { n: rank }) }}
        </span>
      </div>

      <!--
        ترتيب الفرد: شارة ثابتة أعلى الجنب الغامق من التدرّج (بعيدة عن الوش
        المقصوص من أعلى الصورة)، واضحة من أول لحظة بدل ما تُدفَن بين سطور
        النص السفلية.
      -->
      <div v-if="!isTeam && !isIntro && !isDivider && !isRanking && rank > 0" class="absolute top-[5vh] start-[6vw] z-10">
        <span
          class="flex items-center gap-[0.45em] rounded-full bg-gold font-display font-bold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)] [word-spacing:0.25em]"
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
        v-if="!isIntro && !isDivider && !isRanking"
        class="animate-celebrate-in relative flex h-full flex-col gap-[clamp(12px,2.2vh,26px)] py-[6vh] text-white"
        :class="isTeam
          ? (heroManager ? 'w-1/2 ms-auto items-center justify-center px-[3vw] text-center' : 'w-full items-center justify-center px-[6vw] text-center')
          : 'w-[min(60vw,44rem)] items-start justify-end ps-[6vw] pe-[3vw] pb-[clamp(40px,8vh,100px)] text-start'"
      >
        <span
          v-if="isTeam && heroManager && rank > 0"
          class="flex items-center gap-[0.45em] rounded-full bg-gold font-display font-bold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)] [word-spacing:0.25em]"
          :class="isChampion
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.6em] text-[clamp(22px,4.4vh,60px)]'
            : 'px-[1.3em] py-[0.5em] text-[clamp(18px,3.6vh,50px)]'"
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
          class="max-w-[22ch] font-display font-bold leading-[1.1] text-balance break-words drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)] text-[clamp(38px,9vh,116px)]"
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
          v-if="noteText"
          dir="auto"
          class="m-0 flex max-w-[60ch] items-start gap-[0.4em] rounded-2xl bg-black/35 px-[1em] py-[0.6em] break-words font-semibold leading-snug text-[clamp(18px,3.2vh,38px)]"
        >
          <iconify-icon icon="mdi:format-quote-open" aria-hidden="true" class="shrink-0 text-gold text-[1.1em]" />
          <span>{{ noteText }}</span>
        </p>

        <div :class="isTeam ? 'flex flex-col items-center gap-[0.3em]' : 'flex flex-col items-start gap-[0.3em]'" v-if="headline" :title="egp(headline.value)">
          <span class="font-semibold tracking-[0.06em] text-white/70 text-[clamp(14px,2.3vh,26px)]">
            {{ headline.label }}
          </span>
          <span
            class="font-display font-bold leading-[0.95] tabular-nums text-gold drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] text-[clamp(3rem,13vh,10rem)]"
          >
            {{ compact(headline.value) }}
          </span>
        </div>

        <div v-if="isSale" class="font-medium text-white/70 text-[clamp(15px,2.4vh,28px)]" :title="egp(saleEventTotal)">
          {{ t('celebrate.newTotal') }}
          <b class="font-bold tabular-nums text-white">{{ compact(saleEventTotal) }}</b>
        </div>
      </div>

      <!--
        بطاقة فاصلة قبل كل قسم: شعار إيفرست واضح وعنوان القسم القادم بلا أي
        أرقام أو تفاصيل — إعلان لا تهنئة.
      -->
      <div
        v-else-if="isDivider"
        class="animate-celebrate-in relative flex h-full w-full flex-col items-center justify-center gap-[clamp(20px,3.4vh,40px)] px-[6vw] py-[6vh] text-center text-white"
      >
        <!-- الشعار على "لوح القمة" الأبيض: ألوانه الخضرا/التركوازي ما تبانش على الأخضر الغامق -->
        <div class="rounded-[clamp(18px,3vh,36px)] bg-white px-[clamp(28px,4vw,72px)] py-[clamp(16px,2.6vh,40px)] shadow-[0_30px_80px_-24px_rgba(0,0,0,0.75)]">
          <img src="/logo.png" :alt="t('brand')" class="h-[clamp(80px,17vh,190px)] w-auto" draggable="false" />
        </div>
        <span aria-hidden="true" class="h-[3px] w-[clamp(60px,10vw,180px)] rounded-full bg-gold" />
        <h2 class="m-0 font-display font-bold leading-[1.15] text-balance drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] text-[clamp(36px,8.5vh,108px)]">
          {{ t(section === 'team' ? 'celebrate.dividerTeamTitle' : 'celebrate.dividerAgentTitle') }}
        </h2>
      </div>

      <!-- جدول الترتيب بعد كل قسم: ترتيب ربع الاحتفال نفسه -->
      <div
        v-else-if="isRanking"
        class="animate-celebrate-in relative flex h-full w-full flex-col items-center gap-[clamp(14px,3vh,36px)] px-[4vw] py-[5vh] text-white"
      >
        <h2 class="m-0 flex items-center gap-[0.45em] font-display font-bold drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] text-[clamp(26px,5.4vh,68px)]">
          <iconify-icon icon="mdi:podium-gold" aria-hidden="true" class="text-gold" />
          {{ t(section === 'team' ? 'celebrate.rankingTeamTitle' : 'celebrate.rankingAgentTitle') }}
        </h2>

        <!-- الفرق قليلة: كروت كبيرة صورة الفريق فيها واضحة بعرضها، مش دواير صغيرة -->
        <div v-if="section === 'team'" class="flex w-full flex-1 flex-wrap content-center items-center justify-center gap-[clamp(14px,2vw,36px)]">
          <article
            v-for="row in rankingList"
            :key="row.id"
            class="flex flex-col overflow-hidden rounded-[clamp(14px,2vh,26px)] bg-black/40 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/10"
            :class="row.rank === 1 ? 'ring-[3px] ring-gold scale-[1.04]' : ''"
            :style="{ width: `min(34rem, 52vh, ${Math.floor(86 / Math.min(Math.max(rankingList.length, 1), 4))}vw)` }"
          >
            <!-- صور الفرق بوسترات طولية: إطار طولي يعرض البوستر كله بدل ما يتقص -->
            <div class="relative aspect-[3/4] overflow-hidden bg-avatar">
              <img v-if="row.photo" :src="row.photo" alt="" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-cover object-top" />
              <span
                class="absolute top-[0.5em] start-[0.5em] flex items-center gap-[0.25em] rounded-full bg-gold px-[0.6em] py-[0.1em] font-display font-bold text-header shadow-[0_8px_20px_-6px_rgba(0,0,0,0.7)] text-[clamp(20px,4vh,52px)]"
              >
                <iconify-icon v-if="row.rank === 1" icon="mdi:crown" aria-hidden="true" />
                {{ row.rank }}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-[0.6em] px-[0.9em] py-[0.6em] text-[clamp(16px,3vh,38px)]">
              <span class="min-w-0 truncate font-display font-bold">{{ row.name }}</span>
              <span class="shrink-0 font-display font-bold tabular-nums text-gold">{{ compact(row.deals) }}</span>
            </div>
          </article>
        </div>

        <!-- الأفراد: اللي حققوا مبيعات بس، صفوف بصورة مقرّبة على الوش -->
        <ol
          v-else
          class="m-0 grid w-full flex-1 list-none content-center gap-[clamp(8px,1.4vh,18px)] p-0"
          :class="rankingList.length > 10 ? 'grid-cols-3' : 'grid-cols-2'"
        >
          <li
            v-for="row in rankingList"
            :key="row.id"
            class="flex items-center gap-[0.75em] rounded-[clamp(10px,1.6vh,18px)] px-[0.8em] py-[0.5em] text-[clamp(15px,2.5vh,30px)]"
            :class="row.rank <= 3 ? 'bg-black/45 ring-1 ring-gold/60' : 'bg-black/30'"
          >
            <span
              class="flex size-[1.9em] shrink-0 items-center justify-center rounded-full font-display font-bold"
              :class="row.rank <= 3 ? 'bg-gold text-header' : 'bg-white/12 text-white'"
            >{{ row.rank }}</span>
            <span
              class="ranking-face size-[2.6em] shrink-0 rounded-[0.6em] bg-avatar ring-1 ring-white/20"
              :style="row.photo ? { backgroundImage: `url('${row.photo}')` } : undefined"
            />
            <span class="min-w-0 flex-1 truncate font-bold">{{ row.name }}</span>
            <span class="shrink-0 font-display font-bold tabular-nums text-gold">{{ compact(row.deals) }}</span>
          </li>
        </ol>
      </div>

      <!-- افتتاحية الاحتفال: كلمة الإدارة وصور مديري الشركة، مرة قبل الفرق -->
      <div
        v-else-if="isIntro"
        class="animate-celebrate-in relative flex h-full w-full flex-col items-center justify-center gap-[clamp(16px,2.6vh,32px)] px-[6vw] py-[6vh] text-center text-white"
      >
        <div
          class="flex items-center gap-[0.5em] rounded-full bg-accent-strong px-[1.2em] py-[0.45em] font-bold tracking-[0.08em] text-[clamp(14px,2.2vh,26px)]"
        >
          <iconify-icon icon="mdi:bullhorn-variant" aria-hidden="true" class="text-gold text-[1.3em]" />
          {{ t('celebrate.introTitle') }}
        </div>

        <p
          v-if="introMessage"
          dir="auto"
          class="m-0 max-w-[60ch] font-extrabold leading-[1.25] text-balance break-words drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)] text-[clamp(26px,5vh,56px)]"
        >{{ introMessage }}</p>

        <div
          v-if="introDirectors.length"
          class="mt-[clamp(8px,1.5vh,16px)] flex max-w-full flex-wrap items-start justify-center gap-[clamp(16px,3vw,40px)]"
        >
          <div v-for="d in introDirectors" :key="d.id" class="flex flex-col items-center gap-[0.4em]">
            <Avatar
              :entity="{ id: d.id, name: d.name, photo: d.photo, deals: 0, target: 0, pct: 0 }"
              kind="agent"
              class="size-[clamp(5.5rem,14vh,9rem)] rounded-[1.4rem] text-[clamp(1.4rem,3.4vh,2.4rem)] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.65)] ring-2 ring-white/60"
            />
            <span class="max-w-[14ch] truncate font-bold text-white text-[clamp(15px,2.2vh,24px)]">{{ d.name }}</span>
            <span v-if="d.title" class="max-w-[16ch] truncate font-medium text-white/75 text-[clamp(12px,1.7vh,18px)]">{{ d.title }}</span>
          </div>
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

/*
 * المدير المقصوص "واقف" في صورة الفريق: ظل تحته، وأسفله يذوب في المشهد —
 * صور البوستر بتحط اسم الموظف ولقبه على الجزء السفلي، والذوبان بيخفيهم.
 */
.celebrate-figure {
  filter: drop-shadow(0 24px 40px rgba(0, 0, 0, 0.55));
  -webkit-mask-image: linear-gradient(to bottom, #000 52%, transparent 74%);
  mask-image: linear-gradient(to bottom, #000 52%, transparent 74%);
  animation: celebrate-figure-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes celebrate-figure-rise {
  from { opacity: 0; transform: translateY(6vh); }
  to { opacity: 1; transform: none; }
}

/* صور الموظفين بوسترات والوش في أعلى تلتها — نقرّب عليه بدل البوستر كله */
.ranking-face {
  background-size: 175%;
  background-position: 50% 12%;
  background-repeat: no-repeat;
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
  .celebrate-champion-ring, .celebrate-rank-pulse, .celebrate-figure { animation: none; }
}
</style>
