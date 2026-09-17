<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Announcement } from '@/lib/types'
import { useScreenAdmin, type AnnouncementDraft } from '@/composables/useScreenAdmin'
import { activeOccurrence, cairoWallTime, nextOccurrence } from '@/composables/useAnnouncements'

/**
 * رسائل الترحيب والتحفيز: إنشاء وتعديل وجدولة ومعاينة. الجدولة بتوقيت
 * القاهرة أياً كان توقيت جهاز المسؤول.
 */
const { t, locale } = useI18n()
const { announcements, media, saveAnnouncement, deleteAnnouncement } = useScreenAdmin()
const { list, preview, reload } = announcements

const TITLE_MAX = 80
const BODY_MAX = 280
/** أسبوع العمل في مصر: الأحد–الخميس. */
const WORKWEEK = [0, 1, 2, 3, 4]

type When = 'now' | 'once' | 'daily'

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void reload()
  clock = setInterval(() => { now.value = Date.now() }, 15_000)
})
onBeforeUnmount(() => { if (clock) clearInterval(clock) })

// ------------------------------------------------------------ النموذج
const editing = ref<(AnnouncementDraft & { when: When; localDateTime: string }) | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const notice = ref<string | null>(null)

/** وقت القاهرة الحالي بصيغة datetime-local (بعد 10 دقايق، عشان الميعاد يبقى في المستقبل). */
function cairoLocalInput(offsetMs = 10 * 60_000) {
  const d = new Date(Date.now() + offsetMs)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

function toCairoInput(iso: string) {
  return cairoLocalInput(new Date(iso).getTime() - Date.now())
}

function blank(style: Announcement['style'] = 'welcome') {
  formError.value = null
  notice.value = null
  editing.value = {
    id: null,
    style,
    title: '',
    body: '',
    duration_s: 15,
    clip_id: null,
    schedule: 'once',
    starts_at: null,
    daily_time: '09:00',
    weekdays: [...WORKWEEK],
    active: true,
    when: 'now',
    localDateTime: cairoLocalInput(),
  }
}

function edit(a: Announcement) {
  formError.value = null
  notice.value = null
  editing.value = {
    id: a.id,
    style: a.style,
    title: a.title,
    body: a.body ?? '',
    duration_s: a.duration_s,
    clip_id: a.clip_id,
    schedule: a.schedule,
    starts_at: a.starts_at,
    daily_time: a.daily_time ?? '09:00',
    weekdays: a.weekdays.length ? [...a.weekdays] : [...WORKWEEK],
    active: a.active,
    when: a.schedule === 'daily' ? 'daily' : 'once',
    localDateTime: a.starts_at ? toCairoInput(a.starts_at) : cairoLocalInput(),
  }
}

function toggleDay(d: number) {
  if (!editing.value) return
  const days = editing.value.weekdays
  editing.value.weekdays = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort()
}

async function submit() {
  const e = editing.value
  if (!e) return
  formError.value = null
  if (e.when === 'daily' && !e.weekdays.length) {
    formError.value = t('messages.pickDays')
    return
  }
  let startsAt: string | null = null
  if (e.when === 'once') {
    const m = e.localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (!m) {
      formError.value = t('messages.pickTime')
      return
    }
    startsAt = new Date(cairoWallTime(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString()
  }
  saving.value = true
  try {
    await saveAnnouncement({
      ...e,
      schedule: e.when === 'daily' ? 'daily' : 'once',
      // «الآن»: الخادم يستخدم وقت الحفظ
      starts_at: e.when === 'now' ? new Date().toISOString() : startsAt,
    })
    notice.value = e.when === 'now' ? t('messages.sentNow') : t('messages.saved')
    editing.value = null
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function remove(a: Announcement) {
  if (!confirm(t('messages.confirmDelete', { title: a.title }))) return
  try {
    await deleteAnnouncement(a.id)
  } catch (err) {
    notice.value = err instanceof Error ? err.message : String(err)
  }
}

async function setActive(a: Announcement, active: boolean) {
  try {
    await saveAnnouncement({ ...draftOf(a), active })
  } catch (err) {
    notice.value = err instanceof Error ? err.message : String(err)
  }
}

/** إعادة إرسال رسالة المرة الواحدة الآن. */
async function resend(a: Announcement) {
  try {
    await saveAnnouncement({ ...draftOf(a), schedule: 'once', starts_at: new Date().toISOString(), active: true })
    notice.value = t('messages.sentNow')
  } catch (err) {
    notice.value = err instanceof Error ? err.message : String(err)
  }
}

function draftOf(a: Announcement): AnnouncementDraft {
  return {
    id: a.id, style: a.style, title: a.title, body: a.body ?? '', duration_s: a.duration_s, clip_id: a.clip_id,
    schedule: a.schedule, starts_at: a.starts_at, daily_time: a.daily_time ?? '09:00', weekdays: a.weekdays, active: a.active,
  }
}

/** معاينة شكل النموذج الحالي على الشاشة دي. */
function previewDraft() {
  const e = editing.value
  if (!e || !e.title.trim()) return
  preview({
    id: 'preview', style: e.style, title: e.title, body: e.body || null, duration_s: Math.min(e.duration_s, 20),
    clip_id: e.clip_id, schedule: 'once', starts_at: null, daily_time: null, weekdays: [], active: true,
    created_at: '', updated_at: '',
  })
}

// ------------------------------------------------------------ عرض القائمة
const dayNames = computed(() => {
  void locale.value
  const f = new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', timeZone: 'UTC' })
  // 2026-09-13 كان أحد
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 8, 13 + i))))
})

function fmt(ms: number) {
  return new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(ms))
}

function clockOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2026, 0, 1, h, m)))
}

function daysLabel(days: number[]) {
  const key = [...days].sort().join(',')
  if (key === '0,1,2,3,4') return t('messages.workdays')
  if (days.length === 7) return t('messages.everyDay')
  return days.map((d) => dayNames.value[d]).join('، ')
}

const rows = computed(() =>
  list.value.map((a) => {
    const live = activeOccurrence(a, now.value) !== null
    const next = nextOccurrence(a, now.value)
    let status: { tone: string; text: string }
    if (!a.active) status = { tone: 'text-dim', text: t('messages.paused') }
    else if (live) status = { tone: 'text-accent-text', text: t('messages.showingNow') }
    else if (next !== null) status = { tone: 'text-mute', text: t('messages.nextAt', { when: fmt(next) }) }
    else status = { tone: 'text-dim', text: t('messages.ended') }
    const schedule =
      a.schedule === 'daily'
        ? t('messages.dailyAt', { time: clockOf(a.daily_time ?? '09:00'), days: daysLabel(a.weekdays) })
        : t('messages.onceAt', { when: a.starts_at ? fmt(new Date(a.starts_at).getTime()) : '—' })
    return { a, status, schedule, clip: media.value.find((m) => m.id === a.clip_id)?.name ?? null }
  }),
)

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('messages.title') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('messages.hint') }}</p>
      </div>
      <div class="flex gap-2">
        <button
          v-for="s in (['welcome', 'motivation'] as const)"
          :key="s"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
          @click="blank(s)"
        >
          <iconify-icon :icon="s === 'welcome' ? 'mdi:hand-wave' : 'mdi:rocket-launch'" aria-hidden="true" />
          {{ t(`messages.new_${s}`) }}
        </button>
      </div>
    </header>

    <p v-if="notice" role="status" class="m-0 rounded-lg bg-accent/[0.08] px-4 py-2.5 text-sm font-medium text-accent-text">{{ notice }}</p>

    <!-- النموذج -->
    <form
      v-if="editing"
      class="grid gap-5 rounded-xl border border-accent/40 bg-card p-5 shadow-[var(--shadow-card)] lg:grid-cols-[1.2fr_1fr]"
      @submit.prevent="submit"
    >
      <div class="flex flex-col gap-4">
        <fieldset class="m-0 border-0 p-0">
          <legend class="mb-1.5 font-semibold text-caption text-mute">{{ t('messages.style') }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="s in (['welcome', 'motivation'] as const)"
              :key="s"
              type="button"
              class="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors"
              :class="editing.style === s ? 'border-accent bg-accent/10 text-accent-text' : 'border-card-border text-mute hover:text-strong'"
              :aria-pressed="editing.style === s"
              @click="editing.style = s"
            >
              <iconify-icon :icon="s === 'welcome' ? 'mdi:hand-wave' : 'mdi:rocket-launch'" aria-hidden="true" class="text-lg" />
              {{ t(`announce.${s}`) }}
            </button>
          </div>
        </fieldset>

        <label class="flex flex-col gap-1.5">
          <span class="flex justify-between font-semibold text-caption text-mute">
            <span>{{ t('messages.titleField') }} *</span>
            <span class="tabular-nums text-dim">{{ editing.title.length }}/{{ TITLE_MAX }}</span>
          </span>
          <input v-model="editing.title" :maxlength="TITLE_MAX" required dir="auto" :class="FIELD" :placeholder="t(`messages.titlePlaceholder_${editing.style}`)" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="flex justify-between font-semibold text-caption text-mute">
            <span>{{ t('messages.bodyField') }}</span>
            <span class="tabular-nums text-dim">{{ editing.body.length }}/{{ BODY_MAX }}</span>
          </span>
          <textarea v-model="editing.body" :maxlength="BODY_MAX" rows="3" dir="auto" :class="FIELD" :placeholder="t(`messages.bodyPlaceholder_${editing.style}`)" />
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-2">
            <span class="flex justify-between font-semibold text-caption text-mute">
              <span>{{ t('messages.duration') }}</span>
              <b class="tabular-nums text-strong">{{ t('screen.seconds', { n: editing.duration_s }) }}</b>
            </span>
            <input v-model.number="editing.duration_s" type="range" min="5" max="120" step="5" class="w-full accent-[var(--color-accent)]" />
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="font-semibold text-caption text-mute">{{ t('messages.clip') }}</span>
            <select v-model="editing.clip_id" :class="FIELD">
              <option :value="null">{{ t('screen.noSong') }}</option>
              <optgroup v-if="media.some((m) => m.kind === 'clip')" :label="t('screen.group_clip')">
                <option v-for="m in media.filter((x) => x.kind === 'clip')" :key="m.id" :value="m.id">{{ m.name }}</option>
              </optgroup>
              <optgroup v-if="media.some((m) => m.kind === 'song')" :label="t('screen.group_song')">
                <option v-for="m in media.filter((x) => x.kind === 'song')" :key="m.id" :value="m.id">{{ m.name }}</option>
              </optgroup>
            </select>
          </label>
        </div>

        <fieldset class="m-0 flex flex-col gap-3 rounded-lg border border-card-border p-3">
          <legend class="px-1 font-semibold text-strong text-sm">{{ t('messages.when') }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="w in (['now', 'once', 'daily'] as const)"
              :key="w"
              type="button"
              class="rounded-lg border px-2 py-2 text-sm font-semibold transition-colors"
              :class="editing.when === w ? 'border-accent bg-accent/10 text-accent-text' : 'border-card-border text-mute hover:text-strong'"
              :aria-pressed="editing.when === w"
              @click="editing.when = w"
            >{{ t(`messages.when_${w}`) }}</button>
          </div>

          <label v-if="editing.when === 'once'" class="flex flex-col gap-1.5">
            <span class="font-semibold text-caption text-mute">{{ t('messages.dateTime') }}</span>
            <input v-model="editing.localDateTime" type="datetime-local" required :class="FIELD" />
          </label>

          <template v-if="editing.when === 'daily'">
            <label class="flex flex-col gap-1.5">
              <span class="font-semibold text-caption text-mute">{{ t('messages.time') }}</span>
              <input v-model="editing.daily_time" type="time" required :class="FIELD" />
            </label>
            <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('messages.days')">
              <button
                v-for="(d, i) in dayNames"
                :key="i"
                type="button"
                class="min-w-12 rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors"
                :class="editing.weekdays.includes(i) ? 'border-accent bg-accent text-white' : 'border-card-border text-mute hover:text-strong'"
                :aria-pressed="editing.weekdays.includes(i)"
                @click="toggleDay(i)"
              >{{ d }}</button>
            </div>
          </template>
          <p class="m-0 text-caption text-dim">{{ t('messages.cairoTime') }}</p>
        </fieldset>

        <p v-if="formError" role="alert" class="m-0 text-sm text-down">{{ formError }}</p>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            class="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
            :disabled="saving || !editing.title.trim()"
          >
            <iconify-icon :icon="editing.when === 'now' ? 'mdi:television-play' : 'mdi:calendar-check'" aria-hidden="true" class="text-lg" />
            {{ saving ? t('admin.saving') : editing.when === 'now' ? t('messages.sendNow') : t('messages.schedule') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-card-border px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
            :disabled="!editing.title.trim()"
            @click="previewDraft"
          >
            <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="text-lg" />
            {{ t('messages.preview') }}
          </button>
          <button type="button" class="rounded-lg px-4 py-2.5 text-sm font-semibold text-mute hover:text-strong" @click="editing = null">
            {{ t('admin.cancel') }}
          </button>
        </div>
      </div>

      <!-- معاينة مصغّرة حية -->
      <div
        class="flex min-h-64 flex-col items-center justify-center gap-3 overflow-hidden rounded-xl px-6 py-8 text-center text-white"
        :class="editing.style === 'welcome'
          ? 'bg-[radial-gradient(120%_90%_at_50%_0%,#2f7a55_0%,#123b2a_55%,#0b1f17_100%)]'
          : 'bg-[radial-gradient(120%_90%_at_50%_100%,#6b4f16_0%,#1d3a2b_50%,#0c1a14_100%)]'"
        aria-hidden="true"
      >
        <span class="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-caption font-bold">
          <iconify-icon :icon="editing.style === 'welcome' ? 'mdi:hand-wave' : 'mdi:rocket-launch'" :class="editing.style === 'welcome' ? 'text-accent-live' : 'text-gold'" />
          {{ t(`announce.${editing.style}`) }}
        </span>
        <p dir="auto" class="m-0 text-balance break-words text-3xl font-extrabold leading-tight">{{ editing.title || t(`messages.titlePlaceholder_${editing.style}`) }}</p>
        <p v-if="editing.body" dir="auto" class="m-0 text-balance break-words text-base text-white/85">{{ editing.body }}</p>
      </div>
    </form>

    <!-- القائمة -->
    <p v-if="!list.length && !editing" class="m-0 rounded-xl border border-dashed border-card-border px-4 py-10 text-center text-mute">
      {{ t('messages.empty') }}
    </p>

    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="r in rows"
        :key="r.a.id"
        class="flex flex-wrap items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
        :class="r.a.active ? '' : 'opacity-70'"
      >
        <span
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl"
          :class="r.a.style === 'welcome' ? 'bg-accent/12 text-accent-text' : 'bg-gold/15 text-gold'"
          aria-hidden="true"
        >
          <iconify-icon :icon="r.a.style === 'welcome' ? 'mdi:hand-wave' : 'mdi:rocket-launch'" />
        </span>

        <div class="flex min-w-0 flex-1 flex-col">
          <!-- bdi: عنوان إنجليزي يحتفظ باتجاهه من غير ما يغيّر محاذاة الصف -->
          <p class="m-0 truncate font-semibold text-strong"><bdi>{{ r.a.title }}</bdi></p>
          <p class="m-0 truncate text-caption text-mute">
            {{ r.schedule }} · {{ t('screen.seconds', { n: r.a.duration_s }) }}<template v-if="r.clip"> · 🔊 {{ r.clip }}</template>
          </p>
          <p class="m-0 text-caption font-semibold" :class="r.status.tone">{{ r.status.text }}</p>
        </div>

        <label class="inline-flex items-center gap-2 text-caption font-semibold text-mute">
          <input type="checkbox" class="size-4.5 accent-[var(--color-accent)]" :checked="r.a.active" @change="setActive(r.a, ($event.target as HTMLInputElement).checked)" />
          {{ t('messages.active') }}
        </label>

        <div class="flex items-center gap-1.5">
          <button
            v-if="r.a.schedule === 'once'"
            type="button"
            class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-accent-text"
            :title="t('messages.resend')"
            @click="resend(r.a)"
          >
            <iconify-icon icon="mdi:send" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
            :title="t('messages.preview')"
            @click="preview({ ...r.a, duration_s: Math.min(r.a.duration_s, 20) })"
          >
            <iconify-icon icon="mdi:eye-outline" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
            @click="edit(r.a)"
          >{{ t('admin.edit') }}</button>
          <button
            type="button"
            class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
            :aria-label="t('admin.delete')"
            @click="remove(r.a)"
          >
            <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
