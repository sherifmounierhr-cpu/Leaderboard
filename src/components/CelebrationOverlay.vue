<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact as compactNumber, drivePhotoUrl, egp as egpNumber } from '@/lib/format'
import type { BoardEntity } from '@/composables/useBoardData'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { useOverlayLayer } from '@/composables/useOverlayQueue'
import { supabase } from '@/lib/supabase'
import type { AgentStanding, LocaleName, TeamContribution, TeamStanding } from '@/lib/types'
import Avatar from './Avatar.vue'
import BrandLogo from './BrandLogo.vue'

/** كثافة تُقرأ احتفالاً على شاشة 1920 من بعيد، لا نقاطاً متناثرة. */
const PIECES = 44

const { t: translate, locale } = useI18n()
const { celebrations, dismissCelebration } = useSaleEvents()
const { settings, urlOf } = useBoardMedia()

/**
 * لغة الاحتفال: من إعدادات الإدارة لو اتحددت (عربي/إنجليزي لكل الشاشات)،
 * وإلا لغة الشاشة نفسها. كل النصوص والأسماء والأرقام والاتجاه هنا بتتبعها،
 * بمعزل عن لغة اللوحة اللي وراها.
 */
const lang = computed<LocaleName>(() => {
  const forced = settings.value.celebration_lang
  return forced === 'ar' || forced === 'en' ? forced : (locale.value as LocaleName)
})
const t = (key: string, named: Record<string, unknown> = {}) => translate(key, named, { locale: lang.value })
const localName = (name: string, nameAr?: string | null) => (lang.value === 'ar' && nameAr ? nameAr : name)
const compact = (value: unknown) => compactNumber(value, lang.value)
const egp = (value: unknown) => egpNumber(value, lang.value)
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

/** صفقة مشتركة: المستشار الثاني في نفس البطاقة — احتفال واحد يجمع الاتنين. */
const partner = computed<BoardEntity | null>(() => {
  const c = current.value
  if (!c || c.scope !== 'agent' || !c.event.partner_id || !c.event.partner_name) return null
  const e = c.event
  return {
    id: e.partner_id as string,
    name: localName(e.partner_name as string, e.partner_name_ar),
    photo: drivePhotoUrl(e.partner_photo_url ?? null),
    deals: Number(e.partner_amount_egp) || 0,
    target: 0,
    pct: 0,
  }
})
/** نصيب كل مستشار من الصفقة المشتركة — للسطر تحت الرقم الكبير. */
const shares = computed(() => {
  const c = current.value
  if (!c || c.scope !== 'agent' || !partner.value || !agent.value) return []
  const pct = Number(c.event.share_pct) || 0
  const second = Number(c.event.partner_amount_egp) || 0
  return [
    { name: agent.value.name, pct, amount: c.event.amount_egp - second },
    { name: partner.value.name, pct: Math.round((100 - pct) * 100) / 100, amount: second },
  ]
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

/**
 * صور معزولة كتير بتيجي بهوامش شفافة حوالين الشخص (مربعة والشخص في نصها)،
 * فلو اتحجّمت بمقاس الصورة كلها الشخص يطلع صغير. بنقيس حدود الشخص مرة على
 * نسخة مصغّرة (رخيصة)، والقصّ نفسه بالـ CSS — من غير إعادة ترميز الصورة.
 * `cutout`: أركان الصورة شفافة؟ `cors`: القراءة مسموحة (وإلا الصورة كلها كما هي).
 */
interface FigureBox { x: number; y: number; w: number; h: number; ar: number; cutout: boolean; cors: boolean }
const figureBox = ref<Record<string, FigureBox>>({})
const probing = new Map<string, Promise<FigureBox>>()

function probeFigure(url: string): Promise<FigureBox> {
  let pending = probing.get(url)
  if (pending) return pending
  pending = new Promise<FigureBox>((resolve) => {
    const whole = (ar: number, cors: boolean): FigureBox => ({ x: 0, y: 0, w: 1, h: 1, ar, cutout: false, cors })
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => resolve(whole(0.62, false))
    img.onload = () => {
      const W = img.naturalWidth || 1
      const H = img.naturalHeight || 1
      try {
        const s = Math.min(1, 256 / Math.max(W, H))
        const w = Math.max(1, Math.round(W * s))
        const h = Math.max(1, Math.round(H * s))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, w, h)
        const d = ctx.getImageData(0, 0, w, h).data
        const alpha = (x: number, y: number) => d[(y * w + x) * 4 + 3]
        const cutout = [alpha(0, 0), alpha(w - 1, 0), alpha(0, h - 1), alpha(w - 1, h - 1)].some((a) => a < 16)
        let top = h, left = w, right = -1, bottom = -1
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (alpha(x, y) > 24) {
              if (x < left) left = x
              if (x > right) right = x
              if (y < top) top = y
              if (y > bottom) bottom = y
            }
          }
        }
        if (right < 0) return resolve({ ...whole(W / H, true), cutout })
        const bx = Math.max(0, left - 1) / w
        const by = Math.max(0, top - 1) / h
        const bw = Math.min(w, right + 2) / w - bx
        const bh = Math.min(h, bottom + 2) / h - by
        resolve({ x: bx, y: by, w: bw, h: bh, ar: (bw * W) / (bh * H), cutout, cors: true })
      } catch {
        resolve(whole(W / H, false))
      }
    }
    img.src = url
  }).then((box) => {
    figureBox.value = { ...figureBox.value, [url]: box }
    return box
  })
  probing.set(url, pending)
  return pending
}

/** الصورة جوّه إطار الشخص: مكبّرة ومزاحة بحيث حدود الشخص تملا الإطار بالظبط. */
function figureImgStyle(box: FigureBox) {
  return {
    width: `${100 / box.w}%`,
    height: `${100 / box.h}%`,
    left: `${(-box.x / box.w) * 100}%`,
    top: `${(-box.y / box.h) * 100}%`,
  }
}

watch(teamManagers, (list) => list.forEach((m) => m.cutout && void probeFigure(m.cutout)), { immediate: true })

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
interface StandingsSnapshot {
  teams: RankingRow[]
  agents: RankingRow[]
  teamPhotos: Map<string, string>
  /** الفريق اللي المستشار باع له أكتر في الربع ده — مش فريقه الحالي بالضرورة. */
  soldFor: Map<string, string>
}
const standingsCache = ref(new Map<string, StandingsSnapshot>())

/** اللغة جزء من المفتاح: الأسماء المخزّنة مترجمة بلغة الاحتفال وقت الجلب. */
function standingsKey(y: number, q: number) {
  return `${lang.value}:${y}:${q}`
}

async function ensureStandings(y: number, q: number) {
  const key = standingsKey(y, q)
  if (standingsCache.value.has(key)) return
  const [teamRes, agentRes, contribRes] = await Promise.all([
    supabase.from('lb_team_standings').select('*').eq('year', y).eq('quarter', q).order('rank', { ascending: true }),
    supabase.from('lb_agent_standings').select('*').eq('year', y).eq('quarter', q).order('rank', { ascending: true }),
    supabase.from('lb_team_contributions').select('agent_id, team, team_ar, deals').eq('year', y).eq('quarter', q),
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
  // صور كل الفرق حتى اللي مالهاش مبيعات في الربع — فريق المستشار الحالي ممكن يكون منهم
  const teamPhotos = new Map<string, string>()
  for (const row of (teamRes.data ?? []) as TeamStanding[]) {
    const photo = drivePhotoUrl(row.photo_url)
    if (photo) teamPhotos.set(localName(row.name, row.name_ar), photo)
  }
  const soldFor = new Map<string, string>()
  const best = new Map<string, number>()
  for (const row of (contribRes.data ?? []) as Pick<TeamContribution, 'agent_id' | 'team' | 'team_ar' | 'deals'>[]) {
    const deals = Number(row.deals) || 0
    if (deals > 0 && deals > (best.get(row.agent_id) ?? 0)) {
      best.set(row.agent_id, deals)
      soldFor.set(row.agent_id, localName(row.team, row.team_ar))
    }
  }
  const next = new Map(standingsCache.value)
  next.set(key, { teams: teamRows, agents: agentRows, teamPhotos, soldFor })
  standingsCache.value = next
}

watch(
  [current, lang] as const,
  ([c]) => {
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
  // الصفقة المشتركة لاتنين — مفيش مركز واحد يتحط عليها
  if (c.scope === 'agent' && c.event.partner_id) return 0
  if (c.scope === 'agent') return snap.agents.find((a) => a.id === c.event.agent_id)?.rank ?? 0
  return snap.teams.find((t) => t.id === c.event.team_id)?.rank ?? 0
})
/** الأول مميَّز — تاج بدل ميدالية، وتوهّج حوالين الشاشة. الاحتفالات بتتصاعد من الأقل للأعلى فيُختم به. */
const isChampion = computed(() => rank.value === 1)

/**
 * صورة المستشار معزولة (PNG شفاف من زرار عزل الخلفية)؟ بنكشفها بقراءة
 * أركان الصورة. صورة من مصدر ما يسمحش بالقراءة (Drive) تتعامل كعادية.
 */
const agentCutout = ref(false)
watch(
  () => (current.value?.scope === 'agent' ? agent.value?.photo ?? '' : ''),
  (src) => {
    agentCutout.value = false
    if (!src) return
    void probeFigure(src).then((box) => {
      if (agent.value?.photo === src) agentCutout.value = box.cutout
    })
  },
  { immediate: true },
)

/** فريق المستشار في كارته: اللي باع له في الربع ده، وإلا فريقه الحالي. */
const agentTeam = computed(() => {
  const c = current.value
  if (!c || c.scope !== 'agent') return ''
  const snap = standingsCache.value.get(standingsKey(c.event.year, c.event.quarter))
  return snap?.soldFor.get(c.event.agent_id) ?? agent.value?.team ?? ''
})

/** صورة فريق المستشار — خلفيته لما صورته معزولة، زي مديري الفرق. */
const agentTeamPhoto = computed(() => {
  const c = current.value
  if (!c || c.scope !== 'agent' || !agentTeam.value) return ''
  const snap = standingsCache.value.get(standingsKey(c.event.year, c.event.quarter))
  return snap?.teamPhotos.get(agentTeam.value) ?? ''
})

/**
 * خلفية البطاقة بملء الشاشة: صورة الفريق؛ للمستشار صورته مغبّشة، أو صورة
 * فريقه لو صورته معزولة أو مش مرفوعة أصلاً؛ وإلا تدرّج.
 */
const photoUrl = computed(() => {
  if (team.value) return team.value.photo
  if (agent.value) {
    // الصفقة المشتركة: الصورتان في إطارين، والخلفية صورة الفريق
    if (partner.value) return agentTeamPhoto.value
    const photo = agent.value.photo
    if (!photo) return agentTeamPhoto.value
    // لسه بتتقاس: ما نعرضش خلفية هتتبدّل بعد لحظة
    if (!figureBox.value[photo]) return ''
    return agentCutout.value ? agentTeamPhoto.value : photo
  }
  return ''
})

/**
 * تجهيز صور البطاقة الجاية والبطاقة الحالية شغّالة: تحميل وفكّ ترميز وقياس
 * مسبق، فالانتقال ما يتقطّعش على صورة كبيرة بتتفك لحظة ظهورها.
 */
function preload(url: string | null | undefined) {
  if (!url) return
  const img = new Image()
  img.src = url
  void img.decode?.().catch(() => {})
}
watch(
  () => celebrations.value[1],
  (next) => {
    if (!next) return
    if (next.scope === 'team') {
      preload(drivePhotoUrl(next.event.photo_url))
      for (const m of next.event.managers) if (m.cutout_url) void probeFigure(m.cutout_url)
    } else if (next.scope === 'agent') {
      const photo = drivePhotoUrl(next.event.photo_url)
      if (photo) void probeFigure(photo)
      if (next.event.partner_photo_url) preload(drivePhotoUrl(next.event.partner_photo_url))
      const snap = standingsCache.value.get(standingsKey(next.event.year, next.event.quarter))
      const teamName = snap?.soldFor.get(next.event.agent_id) ?? (next.event.team ? localName(next.event.team, next.event.team_ar) : '')
      preload(snap?.teamPhotos.get(teamName))
    }
  },
  { immediate: true },
)
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
  if (isSale.value && partner.value) {
    return t('celebrate.announceShared', {
      name: agent.value?.name ?? '', partner: partner.value.name, amount: egp(c.event.amount_egp),
    })
  }
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
  '#1fa79c',
  'var(--color-accent-live)',
  'var(--color-gold)',
  '#ffffff',
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
    timer = setTimeout(close, holdSeconds.value * 1000)
    if (songUrl.value) void play(songUrl.value, settings.value.volume, holdSeconds.value)
  },
  { immediate: true },
)

/*
 * شريط الوقت أنيميشن CSS (transform فقط) بمدة البطاقة — بدل مؤقّت جافاسكربت
 * كان بيعيد رسم البطاقة كلها خمس مرات في الثانية ويقطّع الحركة.
 */
onBeforeUnmount(() => {
  clear()
  stop()
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
      :dir="lang === 'ar' ? 'rtl' : 'ltr'"
      :lang="lang"
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
        class="absolute inset-0 size-full object-cover"
        :class="agent?.photo && !agentCutout && !partner ? 'celebrate-ambient' : 'celebrate-zoom object-center'"
        @error="imgBroken = true"
      />
      <div
        v-else
        aria-hidden="true"
        class="absolute inset-0 [background:var(--brand-surface)]"
      >
        <span class="peaks !w-[60%] !opacity-[0.08]" />
      </div>
      <!-- شعار إيفرست ثابت في ركن كل بطاقة: الاحتفال باسم الشركة -->
      <!--
        الافتتاحية والترتيب: الركن العلوي فاضي. الفرد: آخر نص الكلام، بعيد عن
        شارة الترتيب في أوله وعن الصورة في النص التاني. الفريق: الشعار تحت
        الكلام نفسه (الجنبين والأعلى محجوزين للمديرين وشارة الترتيب).
      -->
      <BrandLogo
        v-if="!isDivider && !isTeam"
        tone="white"
        class="celebrate-logo pointer-events-none absolute top-[4.5vh] z-10 h-[clamp(34px,6.4vh,76px)] opacity-90"
        :class="isIntro || isRanking ? 'start-[4vw]' : 'end-[47vw]'"
      />

      <!--
        تدرّج جانبي للفرد (الكلام في جنبه)، وتدرّج علوي-سفلي للفريق والافتتاحية
        (الكلام في النص، مالياً عرض الشاشة).
      -->
      <!-- الفرد: الخلفية نسخة مغبّشة من صورته، والكلام فوقها مقروء — الصورة الواضحة في إطارها -->
      <span
        v-if="!isTeam && !isIntro && !isDivider && !isRanking"
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_right,rgba(6,22,23,0.82)_0%,rgba(6,22,23,0.55)_60%,rgba(6,22,23,0.4)_100%)] rtl:bg-[linear-gradient(to_left,rgba(6,22,23,0.82)_0%,rgba(6,22,23,0.55)_60%,rgba(6,22,23,0.4)_100%)]"
      />
      <span
        v-else
        aria-hidden="true"
        class="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,22,23,0.94)_0%,rgba(6,22,23,0.78)_26%,rgba(6,22,23,0.25)_55%,rgba(6,22,23,0.45)_100%)]"
      />
      <!-- ظل سفلي خفيف يفضل حتى مع تدرّج الفرد الجانبي، لوضوح شريط الوقت -->
      <span v-if="!isTeam && !isIntro && !isDivider && !isRanking" aria-hidden="true" class="absolute inset-x-0 bottom-0 h-[26vh] bg-gradient-to-t from-[#061617]/80 to-transparent" />

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
        class="absolute inset-0 bg-[linear-gradient(to_left,rgba(6,22,23,0.78)_0%,rgba(6,22,23,0.35)_45%,transparent_65%)] rtl:bg-[linear-gradient(to_right,rgba(6,22,23,0.78)_0%,rgba(6,22,23,0.35)_45%,transparent_65%)]"
      />

      <!--
        مديرو الفريق واقفين على أرض صورة فريقهم (مقصوصين بلا خلفية): واحد ياخد
        نص الشاشة، اتنين ياخدوا الجنبين. تحت كل واحد لوحة باسمه وترتيب فريقه.
      -->
      <div
        v-for="(m, i) in heroManager ? [heroManager] : sideManagers"
        :key="m.id"
        class="pointer-events-none absolute inset-y-0 flex items-end justify-center"
        :class="heroManager
          ? 'start-[2vw] w-[46vw]'
          : ['w-[32vw]', i === 0 ? 'start-[1vw]' : 'end-[1vw]']"
      >
        <template v-if="m.cutout">
          <div
            v-if="figureBox[m.cutout]"
            class="celebrate-figure"
            :style="{
              '--ar': figureBox[m.cutout].ar,
              '--max-h': heroManager ? '124vh' : '104vh',
              '--max-w': heroManager ? '44vw' : '31vw',
            }"
          >
            <img
              :src="m.cutout"
              alt=""
              :crossorigin="figureBox[m.cutout].cors ? 'anonymous' : undefined"
              :style="figureImgStyle(figureBox[m.cutout])"
            />
          </div>
        </template>
        <!-- لسه ما اتعزلتش من الإدارة: الصورة الأصلية في إطار، مش مربع صغير -->
        <div
          v-else
          class="ranking-face mb-[16vh] aspect-[4/5] rounded-[1.8rem] bg-avatar shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-[3px] ring-white/70"
          :class="heroManager ? 'w-[min(32vw,34rem)]' : 'w-[min(22vw,24rem)]'"
          :style="m.photo ? { backgroundImage: `url('${m.photo}')` } : undefined"
        />

        <div class="absolute inset-x-0 bottom-[4vh] flex justify-center">
          <span
            class="flex max-w-[92%] items-center gap-[0.55em] rounded-full bg-[#061617]/85 py-[0.35em] ps-[0.4em] pe-[1.1em] text-white shadow-[0_12px_32px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/20"
            :class="heroManager ? 'text-[clamp(18px,min(3vh,1.8vw),36px)]' : 'text-[clamp(15px,min(2.4vh,1.44vw),28px)]'"
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
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.65em] text-[clamp(22px,min(4.4vh,2.64vw),60px)]'
            : 'px-[1.3em] py-[0.55em] text-[clamp(18px,min(3.6vh,2.16vw),50px)]'"
        >
          <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
          {{ t('celebrate.rank', { n: rank }) }}
        </span>
      </div>

      <!--
        صورة الفرد كاملة في إطار طولي على الجنب التاني من الكلام — ما تتغطاش
        بالنص، وما تتقصّش على الوش بس (البوستر كله باين زي ما اتصمم).
      -->
      <div
        v-if="agent?.photo && figureBox[agent.photo] && !agentCutout && !partner"
        class="celebrate-portrait absolute end-[5vw] top-1/2 aspect-[4/5] h-[82vh] max-w-[38vw] overflow-hidden rounded-[clamp(18px,3vh,36px)] bg-avatar shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]"
        :class="isChampion ? 'ring-[4px] ring-gold' : 'ring-1 ring-white/20'"
      >
        <img :src="agent.photo" alt="" referrerpolicy="no-referrer" class="size-full object-cover object-top" />
      </div>

      <!-- صورة معزولة: المستشار واقف من أسفل الشاشة على الجنب التاني، زي مديري الفرق -->
      <div v-if="agent?.photo && agentCutout && figureBox[agent.photo] && !partner" class="pointer-events-none absolute inset-y-0 end-[3vw] w-[42vw]">
        <div
          class="celebrate-figure"
          :style="{ '--ar': figureBox[agent.photo].ar, '--max-h': '124vh', '--max-w': '40vw' }"
        >
          <img
            :src="agent.photo"
            alt=""
            crossorigin="anonymous"
            :style="figureImgStyle(figureBox[agent.photo])"
          />
        </div>
      </div>

      <!-- صفقة مشتركة: المستشاران جنب بعض في إطارين متساويين، وتحت كل واحد اسمه ونسبته -->
      <div
        v-if="agent && partner"
        class="animate-celebrate-in absolute inset-y-0 end-[3vw] flex w-[42vw] items-center justify-center gap-[1.6vw]"
      >
        <figure
          v-for="(p, i) in [agent, partner]"
          :key="p.id"
          class="m-0 flex w-[19.5vw] flex-col items-center gap-[1.6vh]"
        >
          <div class="aspect-[4/5] w-full overflow-hidden rounded-[clamp(16px,2.6vh,32px)] bg-avatar ring-[3px] ring-gold shadow-[0_40px_100px_-30px_rgba(0,0,0,0.9)]">
            <img
              v-if="p.photo"
              :src="p.photo"
              alt=""
              referrerpolicy="no-referrer"
              class="size-full object-cover object-top"
            />
            <Avatar v-else :entity="p" kind="agent" class="size-full rounded-none text-[clamp(2rem,min(8vh,4.8vw),6rem)]" />
          </div>
          <figcaption class="flex flex-col items-center gap-[0.2em] text-center text-white">
            <span class="font-display font-bold leading-tight text-balance text-[clamp(16px,min(3vh,1.8vw),36px)]">{{ p.name }}</span>
            <span
              v-if="shares[i]"
              class="rounded-full bg-gold px-[0.9em] py-[0.2em] font-bold tabular-nums text-header text-[clamp(14px,min(2.4vh,1.44vw),28px)]"
            >{{ shares[i].pct }}%</span>
          </figcaption>
        </figure>
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
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.65em] text-[clamp(22px,min(4.4vh,2.64vw),60px)]'
            : 'px-[1.3em] py-[0.55em] text-[clamp(18px,min(3.6vh,2.16vw),50px)]'"
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
        class="celebrate-copy relative flex h-full flex-col gap-[clamp(12px,2.2vh,26px)] py-[6vh] text-white"
        :class="isTeam
          ? (heroManager ? 'w-1/2 ms-auto items-center justify-center px-[3vw] text-center' : 'w-full items-center justify-center px-[6vw] text-center')
          : 'w-[54vw] items-start justify-end ps-[6vw] pe-[2vw] pb-[clamp(40px,8vh,100px)] text-start'"
      >
        <span
          v-if="isTeam && heroManager && rank > 0"
          class="flex items-center gap-[0.45em] rounded-full bg-gold font-display font-bold text-header shadow-[0_10px_36px_-8px_rgba(0,0,0,0.6)] [word-spacing:0.25em]"
          :class="isChampion
            ? 'celebrate-rank-pulse px-[1.5em] py-[0.6em] text-[clamp(22px,min(4.4vh,2.64vw),60px)]'
            : 'px-[1.3em] py-[0.5em] text-[clamp(18px,min(3.6vh,2.16vw),50px)]'"
        >
          <iconify-icon :icon="isChampion ? 'mdi:crown' : 'mdi:medal'" aria-hidden="true" />
          {{ t('celebrate.rank', { n: rank }) }}
        </span>

        <div
          class="flex items-center gap-[0.5em] rounded-full border border-white/25 bg-accent px-[1.2em] py-[0.45em] font-bold tracking-[0.06em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] text-[clamp(14px,min(2.2vh,1.32vw),26px)]"
        >
          <iconify-icon
            :icon="isSale ? 'mdi:party-popper' : 'mdi:trophy'"
            aria-hidden="true"
            class="text-gold text-[1.3em]"
          />
          {{ isTeam ? t('celebrate.teamTitle') : isManual ? t('celebrate.manualTitle') : partner ? t('celebrate.sharedTitle') : t('celebrate.title') }}
        </div>

        <div
          class="max-w-[22ch] font-display font-bold leading-[1.1] text-balance break-words drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)]"
          :class="partner ? 'text-[clamp(30px,min(6.6vh,3.96vw),84px)]' : 'text-[clamp(38px,min(9vh,5.4vw),116px)]'"
        >
          <template v-if="partner">
            {{ agent?.name }} <span class="text-gold">{{ t('celebrate.and') }}</span> {{ partner.name }}
          </template>
          <template v-else>{{ team?.name ?? agent?.name }}</template>
        </div>
        <div v-if="agentTeam && !partner" class="font-medium text-white/80 text-[clamp(16px,min(2.8vh,1.68vw),32px)]">
          {{ t('spotlight.ofTeam', { team: agentTeam }) }}
        </div>

        <!-- مديرون إضافيون نادرون (أكتر من اتنين) — صف صغير بعد الاسم -->
        <div v-if="extraManagers.length" class="flex flex-wrap items-center justify-center gap-[1em] max-w-full">
          <div v-for="m in extraManagers" :key="m.id" class="flex flex-col items-center gap-[0.3em]">
            <Avatar
              :entity="m"
              kind="agent"
              class="size-[clamp(2.6rem,7vh,4.6rem)] rounded-full text-[clamp(0.9rem,min(2vh,1.2vw),1.4rem)] ring-2 ring-white/60"
            />
            <span class="font-semibold text-white/85 text-[clamp(11px,min(1.6vh,0.96vw),16px)] max-w-[10ch] truncate">{{ m.name }}</span>
          </div>
        </div>

        <!--
          بلا علامات تنصيص: الرسالة قد تكون إنجليزية داخل صفحة عربية فتنقلب
          العلامات حولها (”Good One“). dir="auto" يضبط اتجاه الرسالة نفسها.
        -->
        <p
          v-if="noteText"
          dir="auto"
          class="m-0 flex max-w-[60ch] items-start gap-[0.4em] rounded-2xl border border-white/12 bg-[#061617]/55 px-[1em] py-[0.6em] break-words font-semibold leading-snug text-[clamp(18px,min(3.2vh,1.92vw),38px)]"
        >
          <iconify-icon icon="mdi:format-quote-open" aria-hidden="true" class="shrink-0 text-gold text-[1.1em]" />
          <span>{{ noteText }}</span>
        </p>

        <div
          v-if="headline"
          :class="isTeam
            ? 'flex flex-col items-center gap-[0.3em]'
            : 'flex flex-col items-start gap-[0.3em] border-s-[clamp(5px,0.5vw,10px)] ps-[clamp(14px,1.6vw,30px)] [border-image:linear-gradient(to_bottom,var(--color-gold),var(--color-accent-live))_1]'"
          :title="egp(headline.value)"
        >
          <span class="font-semibold tracking-[0.06em] text-white/70 text-[clamp(14px,min(2.3vh,1.38vw),26px)]">
            {{ headline.label }}
          </span>
          <span
            class="font-display font-bold leading-[1.12] tabular-nums text-gold drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] text-[clamp(3rem,min(13vh,7.8vw),10rem)]"
          >
            {{ compact(headline.value) }}
          </span>
        </div>

        <div v-if="isSale && partner" class="flex flex-wrap gap-x-[1.4em] gap-y-[0.2em] font-medium text-white/75 text-[clamp(15px,min(2.4vh,1.44vw),28px)]">
          <span v-for="s in shares" :key="s.name" :title="egp(s.amount)">
            {{ s.name }}
            <b class="font-bold tabular-nums text-white">{{ compact(s.amount) }}</b>
          </span>
        </div>
        <div v-else-if="isSale" class="font-medium text-white/70 text-[clamp(15px,min(2.4vh,1.44vw),28px)]" :title="egp(saleEventTotal)">
          {{ t('celebrate.newTotal') }}
          <b class="font-bold tabular-nums text-white">{{ compact(saleEventTotal) }}</b>
        </div>

        <BrandLogo v-if="isTeam" tone="white" class="mt-[clamp(6px,1.4vh,18px)] h-[clamp(30px,5.6vh,66px)] opacity-90" />
      </div>

      <!--
        بطاقة فاصلة قبل كل قسم: شعار إيفرست واضح وعنوان القسم القادم بلا أي
        أرقام أو تفاصيل — إعلان لا تهنئة.
      -->
      <div
        v-else-if="isDivider"
        class="celebrate-copy relative flex h-full w-full flex-col items-center justify-center gap-[clamp(20px,3.4vh,40px)] px-[6vw] py-[6vh] text-center text-white"
      >
        <!-- الشعار الأبيض مباشرة على سطح الهوية: هو نجم البطاقة دي -->
        <BrandLogo tone="white" class="h-[clamp(96px,22vh,250px)] drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]" />
        <span aria-hidden="true" class="h-[4px] w-[clamp(80px,12vw,220px)] rounded-full bg-[linear-gradient(90deg,var(--color-gold),var(--color-accent-live))]" />
        <h2 class="m-0 font-display font-bold leading-[1.15] text-balance drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] text-[clamp(36px,min(8.5vh,5.1vw),108px)]">
          {{ t(section === 'team' ? 'celebrate.dividerTeamTitle' : 'celebrate.dividerAgentTitle') }}
        </h2>
      </div>

      <!-- جدول الترتيب بعد كل قسم: ترتيب ربع الاحتفال نفسه -->
      <div
        v-else-if="isRanking"
        class="relative flex h-full w-full flex-col items-center gap-[clamp(14px,3vh,36px)] px-[4vw] py-[5vh] text-white"
      >
        <h2 class="rise m-0 flex items-center gap-[0.45em] font-display font-bold drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)] text-[clamp(26px,min(5.4vh,3.24vw),68px)]">
          <iconify-icon icon="mdi:podium-gold" aria-hidden="true" class="text-gold" />
          {{ t(section === 'team' ? 'celebrate.rankingTeamTitle' : 'celebrate.rankingAgentTitle') }}
        </h2>

        <!-- الفرق قليلة: كروت كبيرة صورة الفريق فيها واضحة بعرضها، مش دواير صغيرة -->
        <div v-if="section === 'team'" class="flex w-full flex-1 flex-wrap content-center items-center justify-center gap-[clamp(14px,2vw,36px)]">
          <article
            v-for="row in rankingList"
            :key="row.id"
            class="rise flex flex-col overflow-hidden rounded-[clamp(14px,2vh,26px)] bg-[#061617]/70 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-white/15"
            :class="row.rank === 1 ? 'ring-[3px] ring-gold scale-[1.04]' : ''"
            :style="{ '--i': row.rank + 1, width: `min(34rem, 52vh, ${Math.floor(86 / Math.min(Math.max(rankingList.length, 1), 4))}vw)` }"
          >
            <!-- صور الفرق بوسترات طولية: إطار طولي يعرض البوستر كله بدل ما يتقص -->
            <div class="relative aspect-[3/4] overflow-hidden bg-avatar">
              <img v-if="row.photo" :src="row.photo" alt="" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-cover object-top" />
              <span
                class="absolute top-[0.5em] start-[0.5em] flex items-center gap-[0.25em] rounded-full bg-gold px-[0.6em] py-[0.1em] font-display font-bold text-header shadow-[0_8px_20px_-6px_rgba(0,0,0,0.7)] text-[clamp(20px,min(4vh,2.4vw),52px)]"
              >
                <iconify-icon v-if="row.rank === 1" icon="mdi:crown" aria-hidden="true" />
                {{ row.rank }}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-[0.6em] px-[0.9em] py-[0.6em] text-[clamp(16px,min(3vh,1.8vw),38px)]">
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
            class="rise flex items-center gap-[0.75em] rounded-[clamp(10px,1.6vh,18px)] px-[0.8em] py-[0.5em]"
            :class="[
              row.rank <= 3 ? 'bg-[#061617]/70 ring-1 ring-gold/70' : 'bg-[#061617]/50 ring-1 ring-white/10',
              rankingList.length <= 10 ? 'text-[clamp(17px,min(3vh,1.8vw),36px)]' : 'text-[clamp(15px,min(2.5vh,1.5vw),30px)]',
            ]"
            :style="{ '--i': Math.min(row.rank, 14) }"
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
            <span class="shrink-0 font-bold tabular-nums text-gold">{{ compact(row.deals) }}</span>
          </li>
        </ol>
      </div>

      <!-- افتتاحية الاحتفال: كلمة الإدارة وصور مديري الشركة، مرة قبل الفرق -->
      <div
        v-else-if="isIntro"
        class="celebrate-copy relative flex h-full w-full flex-col items-center justify-center gap-[clamp(16px,2.6vh,32px)] px-[6vw] py-[6vh] text-center text-white"
      >
        <div
          class="flex items-center gap-[0.5em] rounded-full border border-white/25 bg-accent px-[1.2em] py-[0.45em] font-bold tracking-[0.06em] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] text-[clamp(14px,min(2.2vh,1.32vw),26px)]"
        >
          <iconify-icon icon="mdi:bullhorn-variant" aria-hidden="true" class="text-gold text-[1.3em]" />
          {{ t('celebrate.introTitle') }}
        </div>

        <p
          v-if="introMessage"
          dir="auto"
          class="m-0 max-w-[60ch] font-extrabold leading-[1.25] text-balance break-words drop-shadow-[0_4px_28px_rgba(0,0,0,0.65)] text-[clamp(26px,min(5vh,3vw),56px)]"
        >{{ introMessage }}</p>

        <div
          v-if="introDirectors.length"
          class="mt-[clamp(8px,1.5vh,16px)] flex max-w-full flex-wrap items-start justify-center gap-[clamp(16px,3vw,40px)]"
        >
          <div v-for="d in introDirectors" :key="d.id" class="flex flex-col items-center gap-[0.4em]">
            <Avatar
              :entity="{ id: d.id, name: d.name, photo: d.photo, deals: 0, target: 0, pct: 0 }"
              kind="agent"
              size="large"
              class="size-[clamp(5.5rem,14vh,9rem)] rounded-[1.4rem] text-[clamp(1.4rem,min(3.4vh,2.04vw),2.4rem)] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.65)] ring-2 ring-white/60"
            />
            <span class="max-w-[14ch] truncate font-bold text-white text-[clamp(15px,min(2.2vh,1.32vw),24px)]">{{ d.name }}</span>
            <span v-if="d.title" class="max-w-[16ch] truncate font-medium text-white/75 text-[clamp(12px,min(1.7vh,1.02vw),18px)]">{{ d.title }}</span>
          </div>
        </div>
      </div>

      <div class="absolute inset-x-0 bottom-0 h-[clamp(4px,0.7vh,8px)] bg-white/10" aria-hidden="true">
        <div
          :key="current.key"
          class="celebrate-progress h-full w-full bg-gold"
          :style="{ animationDuration: `${holdSeconds}s` }"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/*
 * عمود الكلام يدخل سطراً سطراً بترتيب القراءة (الشارة، الاسم، الفريق،
 * الرقم) بدل ما يظهر كتلة واحدة. `backwards` فقط: بعد النهاية لا يبقى
 * transform على العناصر.
 */
.celebrate-copy > * {
  animation: celebrate-line 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
.celebrate-copy > :nth-child(1) { animation-delay: 0.1s; }
.celebrate-copy > :nth-child(2) { animation-delay: 0.22s; }
.celebrate-copy > :nth-child(3) { animation-delay: 0.34s; }
.celebrate-copy > :nth-child(4) { animation-delay: 0.46s; }
.celebrate-copy > :nth-child(5) { animation-delay: 0.58s; }
.celebrate-copy > :nth-child(n + 6) { animation-delay: 0.7s; }
@keyframes celebrate-line {
  from { opacity: 0; transform: translateY(22px); }
  to { opacity: 1; transform: none; }
}
.celebrate-logo { animation: celebrate-logo 0.8s ease-out 0.2s backwards; }
@keyframes celebrate-logo {
  from { opacity: 0; }
  to { opacity: 0.9; }
}
@media (prefers-reduced-motion: reduce) {
  .celebrate-copy > *, .celebrate-logo { animation: none; }
}

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
/* خلفية الفرد: صورته نفسها مغبّشة وغامقة — بتملا الشاشة من غير ما تنافس الإطار */
.celebrate-ambient {
  filter: blur(36px) brightness(0.55) saturate(1.1);
  transform: scale(1.15);
}
.celebrate-portrait {
  transform: translateY(-50%);
  animation: celebrate-portrait-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes celebrate-portrait-in {
  from { opacity: 0; transform: translateY(calc(-50% + 4vh)) scale(0.97); }
  to { opacity: 1; transform: translateY(-50%); }
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
  /*
   * الطول: أكبر حاجة تساع العمود. الربع السفلي (اللي فيه اسم البوستر وذوبانه)
   * بينزل تحت حافة الشاشة، فالشخص "واقف" من أسفل الشاشة بدل ما يطفو في نصها.
   */
  --fig-h: min(var(--max-h), calc(var(--max-w) / var(--ar)));
  position: absolute;
  inset-inline: 0;
  margin-inline: auto;
  bottom: calc(var(--fig-h) * -0.26);
  height: var(--fig-h);
  width: calc(var(--fig-h) * var(--ar));
  overflow: hidden;
  filter: drop-shadow(0 24px 40px rgba(0, 0, 0, 0.55));
  -webkit-mask-image: linear-gradient(to bottom, #000 52%, transparent 74%);
  mask-image: linear-gradient(to bottom, #000 52%, transparent 74%);
  animation: celebrate-figure-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* الصورة جوّه الإطار مكبّرة ومزاحة (من figureImgStyle) بحيث الشخص يملا الإطار */
.celebrate-figure > img {
  position: absolute;
  max-width: none;
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
/*
 * التوهّج ظل ثابت على طبقة لوحدها، والنبض بيغيّر شفافيتها بس — تحريك
 * box-shadow نفسه بيعيد رسم الشاشة كلها كل فريم وبيقطّع الحركة.
 */
.celebrate-champion-ring::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 20;
  pointer-events: none;
  box-shadow: inset 0 0 clamp(40px, 6vh, 100px) 0 color-mix(in oklab, var(--color-gold) 85%, transparent);
  animation: celebrate-champion-glow 2.4s ease-in-out infinite;
  will-change: opacity;
}
@keyframes celebrate-champion-glow {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

/* شريط الوقت: تمدّد بالـ transform من بداية السطر لآخره على مدة البطاقة */
.celebrate-progress {
  transform-origin: left center;
  animation: celebrate-progress linear both;
  will-change: transform;
}
[dir='rtl'] .celebrate-progress {
  transform-origin: right center;
}
@keyframes celebrate-progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.celebrate-rank-pulse {
  animation: celebrate-rank-pulse 1.8s ease-in-out infinite;
}
@keyframes celebrate-rank-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@media (prefers-reduced-motion: reduce) {
  .celebrate-champion-ring::after, .celebrate-rank-pulse, .celebrate-figure, .celebrate-portrait { animation: none; }
}
</style>
