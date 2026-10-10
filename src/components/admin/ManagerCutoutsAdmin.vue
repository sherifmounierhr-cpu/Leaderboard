<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { removeBackground } from '@/lib/cutout'
import type { TeamManagerRow } from '@/lib/types'
import CutoutReview from './CutoutReview.vue'

const { t, locale } = useI18n()

const managers = ref<TeamManagerRow[]>([])
/** حالة كل مدير أثناء المعالجة: id → رسالة أو "working". */
const busy = ref<Record<string, 'working' | undefined>>({})
const error = ref<string | null>(null)
const runningAll = ref(false)

const missing = computed(() => managers.value.filter((m) => m.photo_url && !m.cutout_url))

function nameOf(m: TeamManagerRow) {
  return locale.value === 'ar' && m.name_ar ? m.name_ar : m.name
}

async function load() {
  const { data, error: err } = await supabase.from('lb_team_managers').select('*').order('name')
  if (err) {
    error.value = err.message
    return
  }
  managers.value = (data ?? []) as TeamManagerRow[]
}

async function save(m: TeamManagerRow, blob: Blob) {
  const path = `cutouts/${m.id}-${Date.now()}.png`
  const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/png', upsert: true })
  if (up.error) throw new Error(up.error.message)
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  const { error: err } = await supabase.rpc('lb_admin_set_cutout', { p_agent_id: m.id, p_url: url })
  if (err) throw new Error(err.message)
  m.cutout_url = url
}

async function run(m: TeamManagerRow, task: () => Promise<Blob>) {
  busy.value = { ...busy.value, [m.id]: 'working' }
  error.value = null
  try {
    await save(m, await task())
  } catch (err) {
    error.value = `${nameOf(m)}: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    busy.value = { ...busy.value, [m.id]: undefined }
  }
}

function autoCut(m: TeamManagerRow) {
  if (!m.photo_url) return Promise.resolve()
  return run(m, () => removeBackground(m.photo_url!))
}

/** لو في ناقصين يتعزلوا هما بس، وإلا إعادة عزل الكل (مثلاً بعد تحسين الحواف). */
async function autoCutAll() {
  runningAll.value = true
  const list = missing.value.length ? [...missing.value] : managers.value.filter((m) => m.photo_url)
  for (const m of list) await autoCut(m)
  runningAll.value = false
}

/** العزل الفردي بيعدّي على نافذة المراجعة (درجة تنضيف الحواف) قبل الحفظ. */
const reviewFor = ref<TeamManagerRow | null>(null)
function onReviewed(blob: Blob) {
  const m = reviewFor.value
  reviewFor.value = null
  if (m) void run(m, async () => blob)
}

function onUpload(m: TeamManagerRow, ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void run(m, async () => file)
}

async function clearCutout(m: TeamManagerRow) {
  const { error: err } = await supabase.rpc('lb_admin_set_cutout', { p_agent_id: m.id, p_url: null })
  if (err) error.value = err.message
  else m.cutout_url = null
}

onMounted(load)

const BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50'
</script>

<template>
  <section class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]">
    <header class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="admin-card-title">{{ t('admin.cutouts') }}</h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('admin.cutoutsHint') }}</p>
      </div>
      <button
        v-if="managers.length"
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        :disabled="runningAll"
        @click="autoCutAll"
      >
        <iconify-icon icon="mdi:auto-fix" aria-hidden="true" />
        {{ runningAll
          ? t('admin.cutoutWorking')
          : missing.length ? t('admin.cutoutAll', { n: missing.length }) : t('admin.cutoutRedoAll') }}
      </button>
    </header>

    <p v-if="error" role="alert" class="m-0 text-caption text-down">{{ error }}</p>

    <ul class="m-0 p-0 list-none flex flex-col gap-2">
      <li
        v-for="m in managers"
        :key="m.id"
        class="flex flex-wrap items-center gap-3 admin-row rounded-xl border border-card-border bg-page px-4 py-3"
      >
        <span
          class="size-14 shrink-0 rounded-lg bg-avatar bg-cover bg-center outline outline-1 -outline-offset-1 outline-strong/10"
          :style="m.photo_url ? { backgroundImage: `url('${m.photo_url}')` } : undefined"
        />
        <iconify-icon icon="mdi:arrow-right" aria-hidden="true" class="text-dim rtl:rotate-180" />
        <!-- مربعات شطرنج خلف الصورة المعزولة عشان الشفافية تبان -->
        <span
          class="cutout-checker relative size-14 shrink-0 overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-strong/10"
        >
          <img v-if="m.cutout_url" :src="m.cutout_url" alt="" class="absolute inset-0 size-full object-contain object-bottom" />
          <iconify-icon v-else-if="busy[m.id]" icon="mdi:loading" aria-hidden="true" class="absolute inset-0 m-auto size-fit animate-spin text-mute text-xl" />
        </span>

        <div class="min-w-0 flex-1">
          <p class="m-0 font-semibold text-strong truncate">{{ nameOf(m) }}</p>
          <p class="m-0 text-caption text-mute truncate">
            {{ locale === 'ar' && m.team_ar ? m.team_ar : m.team }} ·
            {{ busy[m.id] ? t('admin.cutoutWorking') : m.cutout_url ? t('admin.cutoutReady') : t('admin.cutoutNone') }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" :class="BTN" :disabled="!m.photo_url || !!busy[m.id] || runningAll" @click="reviewFor = m">
            <iconify-icon icon="mdi:auto-fix" aria-hidden="true" />
            {{ m.cutout_url ? t('admin.cutoutReview') : t('admin.cutoutAuto') }}
          </button>
          <label :class="[BTN, 'cursor-pointer']">
            <iconify-icon icon="mdi:upload" aria-hidden="true" />
            {{ t('admin.cutoutUpload') }}
            <input type="file" accept="image/png,image/webp" class="sr-only" @change="onUpload(m, $event)" />
          </label>
          <button
            v-if="m.cutout_url"
            type="button"
            :class="[BTN, 'hover:text-down']"
            :aria-label="t('admin.delete')"
            @click="clearCutout(m)"
          >
            <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
          </button>
        </div>
      </li>
      <li v-if="!managers.length" class="text-caption text-dim">{{ t('admin.cutoutsEmpty') }}</li>
    </ul>

    <CutoutReview
      v-if="reviewFor?.photo_url"
      :src="reviewFor.photo_url"
      :name="nameOf(reviewFor)"
      @confirm="onReviewed"
      @cancel="reviewFor = null"
    />
  </section>
</template>

<style scoped>
.cutout-checker {
  background-color: #fff;
  background-image: conic-gradient(#d9dde2 25%, transparent 0 50%, #d9dde2 0 75%, transparent 0);
  background-size: 12px 12px;
}
</style>
