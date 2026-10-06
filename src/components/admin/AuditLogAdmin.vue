<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { compact, relativeTime } from '@/lib/format'
import { useAdminData } from '@/composables/useAdminData'
import { useLocalName } from '@/composables/useLocalName'
import { NUMBER_LOCALE } from '@/lib/region'

/**
 * سجل المستخدمين: مَن دخل لوحة الإدارة ومَن أضاف أو عدّل أو حذف ماذا.
 * التسجيل نفسه في القاعدة (triggers)، فلا يعتمد على هذه الصفحة ولا يُتخطّى منها.
 * كل عملية واحدة (استيراد ملف مثلاً) سطر واحد يتفتح على تفاصيله.
 */
interface Entry {
  action: string
  entity: string | null
  label: string | null
  details: {
    changes?: Record<string, [unknown, unknown]>
    ctx?: Record<string, unknown>
  } | null
}

interface Group {
  last_id: number
  at: string
  user_id: string | null
  actor: string | null
  total: number
  entries: Entry[]
}

const PAGE = 60
const KNOWN_ACTIONS = [
  'login', 'insert', 'update', 'delete',
  'user_create', 'user_email', 'user_password', 'user_ban', 'user_unban', 'user_delete',
]
const KNOWN_ENTITIES = [
  'agents', 'teams', 'team_leads', 'deals', 'sales', 'targets', 'announcements', 'board_settings',
  'directors', 'media_files', 'news_casts', 'news_hidden', 'user_access', 'usernames', 'admins',
  'devices', 'sale_events', 'celebration_intros', 'users',
]
const KNOWN_FIELDS = [
  'name', 'name_ar', 'team_id', 'photo_url', 'cutout_url', 'active', 'amount_egp', 'target_egp',
  'role', 'permissions', 'username', 'label', 'revoked_at', 'watch', 'title', 'title_ar', 'body',
  'style', 'duration_s', 'schedule', 'starts_at', 'daily_time', 'weekdays', 'clip_id', 'position',
  'deal_date', 'developer', 'project', 'celebration_seconds', 'celebration_song_id', 'volume',
  'celebration_lang', 'cbe_deposit', 'cbe_lending', 'cbe_rates_at', 'news_enabled', 'news_slide_s',
  'news_repeats', 'news_gap_min', 'news_chime', 'news_volume', 'news_sound_id', 'alerts_enabled',
  'alert_email', 'alert_after_min',
]
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

const { t, locale } = useI18n()
const localName = useLocalName()
const { agents, teams } = useAdminData()

const groups = ref<Group[]>([])
const loading = ref(false)
const done = ref(false)
const error = ref<string | null>(null)
const userFilter = ref('')
const kindFilter = ref<'all' | 'login' | 'changes'>('all')
const expanded = ref<Set<number>>(new Set())
/** كل مَن ظهر في السجل — للفلتر. يتراكم مع التحميل ولا يتأثر بالفلتر نفسه. */
const actors = ref<Map<string, string>>(new Map())

async function load(reset = true) {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    const before = reset ? null : groups.value[groups.value.length - 1]?.last_id ?? null
    const { data, error: err } = await supabase.rpc('lb_admin_audit_log', {
      p_limit: PAGE,
      p_before: before,
      p_user: userFilter.value || null,
    })
    if (err) throw new Error(err.message)
    const rows = (data ?? []) as Group[]
    groups.value = reset ? rows : [...groups.value, ...rows]
    done.value = rows.length < PAGE
    if (reset) expanded.value = new Set()
    const next = new Map(actors.value)
    for (const g of rows) if (g.user_id) next.set(g.user_id, g.actor ?? '—')
    actors.value = next
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => { void load() })

const nameOf = computed(() => {
  const map = new Map<string, string>()
  for (const team of teams.value) map.set(team.id, localName(team.name, team.name_ar))
  for (const a of agents.value) map.set(a.id, localName(a.name, a.name_ar))
  return map
})

/** الاسم المسجَّل إنجليزي (مفتاح ثابت) — يُعرض بلغة الصفحة لو صاحبه ما زال موجوداً. */
const localLabel = computed(() => {
  const map = new Map<string, string>()
  for (const team of teams.value) map.set(team.name, localName(team.name, team.name_ar))
  for (const a of agents.value) map.set(a.name, localName(a.name, a.name_ar))
  return (label: string) => map.get(label) ?? label
})

const actionText = (action: string) => (KNOWN_ACTIONS.includes(action) ? t(`audit.action.${action}`) : action)
const entityText = (entity: string | null) =>
  !entity ? '' : KNOWN_ENTITIES.includes(entity) ? t(`audit.entity.${entity}`) : entity
const fieldText = (key: string) => (KNOWN_FIELDS.includes(key) ? t(`audit.field.${key}`) : key)

function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return t('audit.none')
  if (typeof value === 'boolean') return t(value ? 'audit.yes' : 'audit.no')
  if (key === 'amount_egp' || key === 'target_egp') return compact(Number(value) || 0)
  if (key === 'permissions' && Array.isArray(value)) return value.length ? value.join('، ') : t('audit.none')
  if (Array.isArray(value)) return value.join('، ')
  const text = String(value)
  if (UUID_RE.test(text)) return nameOf.value.get(text) ?? '…'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/** سطر التغيير: «الاسم: القديم ← الجديد»؛ الصور تُذكر بلا روابط. */
function changeLines(entry: Entry): string[] {
  const changes = entry.details?.changes
  if (!changes) return []
  return Object.entries(changes).map(([key, [from, to]]) =>
    key.endsWith('_url')
      ? t('audit.changedOnly', { field: fieldText(key) })
      : t('audit.changed', { field: fieldText(key), from: valueText(key, from), to: valueText(key, to) }),
  )
}

/** ما يميّز السطر: المبلغ والفريق والربع… */
function contextText(entry: Entry): string {
  const ctx = entry.details?.ctx
  if (!ctx) return ''
  const parts: string[] = []
  if (ctx.amount !== undefined) parts.push(compact(Number(ctx.amount) || 0))
  if (ctx.target !== undefined) parts.push(t('audit.target', { amount: compact(Number(ctx.target) || 0) }))
  if (ctx.project) parts.push(String(ctx.project))
  if (ctx.developer) parts.push(String(ctx.developer))
  if (ctx.team && entry.entity !== 'teams') parts.push(localLabel.value(String(ctx.team)))
  if (ctx.date) parts.push(String(ctx.date))
  else if (ctx.quarter && ctx.year) parts.push(`Q${ctx.quarter} ${ctx.year}`)
  if (entry.entity === 'user_access' && ctx.role) parts.push(String(ctx.role))
  return parts.join(' · ')
}

function entryTitle(entry: Entry): string {
  if (entry.action === 'login') return t('audit.action.login')
  const head = [actionText(entry.action), entityText(entry.action.startsWith('user_') ? null : entry.entity)]
    .filter(Boolean).join(' ')
  return entry.label ? `${head}: ${localLabel.value(entry.label)}` : head
}

const ICON: Record<string, string> = {
  login: 'mdi:login-variant',
  insert: 'mdi:plus-circle-outline',
  update: 'mdi:pencil-outline',
  delete: 'mdi:trash-can-outline',
  user_create: 'mdi:account-plus-outline',
  user_password: 'mdi:lock-reset',
  user_email: 'mdi:email-edit-outline',
  user_ban: 'mdi:account-cancel-outline',
  user_unban: 'mdi:account-check-outline',
  user_delete: 'mdi:account-remove-outline',
}
const TONE: Record<string, string> = {
  login: 'bg-page text-mute',
  insert: 'bg-accent/12 text-accent-text',
  update: 'bg-gold/15 text-gold',
  delete: 'bg-down/10 text-down',
  user_create: 'bg-accent/12 text-accent-text',
  user_delete: 'bg-down/10 text-down',
  user_ban: 'bg-down/10 text-down',
}

const rows = computed(() => {
  void locale.value
  const now = new Date()
  const stamp = new Intl.DateTimeFormat(locale.value === 'ar' ? NUMBER_LOCALE.ar : 'en-GB', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
  return groups.value
    .filter((g) => {
      const isLogin = g.entries.every((e) => e.action === 'login')
      return kindFilter.value === 'all' || (kindFilter.value === 'login') === isLogin
    })
    .map((g) => {
      // الدخول المسجَّل داخل نفس العملية لا يتصدّر السطر
      const main = g.entries.find((e) => e.action !== 'login') ?? g.entries[0]
      const when = new Date(g.at)
      return {
        group: g,
        main,
        title: entryTitle(main),
        context: contextText(main),
        changes: changeLines(main),
        icon: ICON[main.action] ?? 'mdi:circle-small',
        tone: TONE[main.action] ?? 'bg-page text-mute',
        ago: relativeTime(when, now),
        stamp: stamp.format(when),
        open: expanded.value.has(g.last_id),
        hidden: g.total - g.entries.length,
      }
    })
})

function toggle(id: number) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const FIELD =
  'rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('audit.title') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('audit.hint') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="userFilter" :aria-label="t('audit.user')" :class="FIELD" @change="load()">
          <option value="">{{ t('audit.allUsers') }}</option>
          <option v-for="[id, name] in actors" :key="id" :value="id">{{ name }}</option>
        </select>
        <select v-model="kindFilter" :aria-label="t('audit.kind')" :class="FIELD">
          <option value="all">{{ t('audit.kindAll') }}</option>
          <option value="changes">{{ t('audit.kindChanges') }}</option>
          <option value="login">{{ t('audit.kindLogin') }}</option>
        </select>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
          :disabled="loading"
          @click="load()"
        >
          <iconify-icon icon="mdi:refresh" aria-hidden="true" :class="loading ? 'animate-spin' : ''" />
          {{ t('admin.storage.refresh') }}
        </button>
      </div>
    </header>

    <p v-if="error" role="alert" class="m-0 rounded-lg bg-down/10 px-4 py-2.5 text-sm font-medium text-down">{{ error }}</p>

    <p v-if="loading && !groups.length" class="m-0 text-mute text-sm">{{ t('admin.loading') }}</p>
    <p
      v-else-if="!rows.length"
      class="m-0 rounded-xl border border-dashed border-card-border px-4 py-10 text-center text-mute"
    >{{ t('audit.empty') }}</p>

    <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="r in rows"
        :key="r.group.last_id"
        class="flex flex-col gap-2 rounded-xl border border-card-border bg-card px-4 py-3"
      >
        <div class="flex flex-wrap items-start gap-3">
          <span
            class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
            :class="r.tone"
            aria-hidden="true"
          >
            <iconify-icon :icon="r.icon" />
          </span>

          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="m-0 flex flex-wrap items-baseline gap-x-2 font-semibold text-strong">
              <span dir="ltr">{{ r.group.actor ?? t('audit.unknownUser') }}</span>
              <span class="font-medium text-mute text-sm">{{ r.title }}</span>
            </p>
            <p v-if="r.context" class="m-0 text-caption text-mute">{{ r.context }}</p>
            <p v-for="line in r.changes" :key="line" class="m-0 text-caption text-mute">{{ line }}</p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-1">
            <time :datetime="r.group.at" class="text-caption text-dim" :title="r.stamp">{{ r.ago }}</time>
            <span class="text-caption text-dim tabular-nums">{{ r.stamp }}</span>
          </div>
        </div>

        <template v-if="r.group.total > 1">
          <button
            type="button"
            class="inline-flex items-center gap-1 self-start rounded-lg border border-card-border px-2.5 py-1 text-caption font-semibold text-mute transition-colors hover:text-strong"
            :aria-expanded="r.open"
            @click="toggle(r.group.last_id)"
          >
            <iconify-icon :icon="r.open ? 'mdi:chevron-up' : 'mdi:chevron-down'" aria-hidden="true" />
            {{ t('audit.steps', { n: r.group.total }) }}
          </button>

          <ol v-if="r.open" class="m-0 flex list-none flex-col gap-1.5 border-s-2 border-card-border ps-3">
            <li v-for="(e, i) in r.group.entries" :key="i" class="flex flex-col text-caption">
              <span class="font-semibold text-strong">{{ entryTitle(e) }}</span>
              <span v-if="contextText(e)" class="text-mute">{{ contextText(e) }}</span>
              <span v-for="line in changeLines(e)" :key="line" class="text-mute">{{ line }}</span>
            </li>
            <li v-if="r.hidden > 0" class="text-caption text-dim">{{ t('audit.more', { n: r.hidden }) }}</li>
          </ol>
        </template>
      </li>
    </ul>

    <button
      v-if="groups.length && !done"
      type="button"
      class="self-center rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
      :disabled="loading"
      @click="load(false)"
    >{{ loading ? t('admin.loading') : t('audit.loadMore') }}</button>
  </section>
</template>
