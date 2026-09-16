<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useStorageHealth, type Level, type MeterKey } from '@/composables/useStorageHealth'
import { collectBackup, downloadText, renderBackupHtml } from '@/lib/backup'
import { relativeTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'

const emit = defineEmits<{ goto: [tab: 'data'] }>()

const { t, locale } = useI18n()
const { isDemo } = useAuth()
const { usage, meters, worst, backupStale, loading, error, githubError, refresh, start, stop } = useStorageHealth()

onMounted(start)
onBeforeUnmount(stop)

const units = ['B', 'KB', 'MB', 'GB']
function bytes(n: number) {
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: v < 10 && i ? 1 : 0 }).format(v)} ${units[i]}`
}
const count = (n: number) => new Intl.NumberFormat('en-US').format(n)
const ago = (iso: string | null) => (iso ? relativeTime(new Date(iso)) : t('admin.storage.never'))
const dateOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB') : '—'

const ICON: Record<MeterKey, string> = {
  db: 'mdi:database-outline',
  files: 'mdi:image-multiple-outline',
  github: 'mdi:github',
}
const BAR: Record<Level, string> = { ok: 'bg-accent', warn: 'bg-gold', critical: 'bg-down' }
const TEXT: Record<Level, string> = { ok: 'text-accent-text', warn: 'text-gold', critical: 'text-down' }

// ------------------------------------------------ النسخة الاحتياطية
const backingUp = ref(false)
const backupDone = ref(false)
const backupError = ref<string | null>(null)

async function onBackup() {
  backingUp.value = true
  backupError.value = null
  try {
    const data = await collectBackup()
    downloadText(renderBackupHtml(data), `everest-leaderboard-backup-${data.created_at.slice(0, 10)}.html`)
    backupDone.value = true
    // حساب العرض يقدر ينزّل النسخة، لكن لا يسجّل في قاعدة البيانات
    if (!isDemo.value) {
      await supabase.rpc('lb_admin_log_backup', {
        p_details: {
          teams: data.teams.length,
          agents: data.agents.length,
          events: data.sale_events.length,
          snapshots: data.rank_history.length,
        },
      })
      void refresh()
    }
  } catch (err) {
    backupError.value = err instanceof Error ? err.message : String(err)
  } finally {
    backingUp.value = false
  }
}

// ------------------------------------------------------ الإخلاء
const table = (key: string) => usage.value?.tables.find((x) => x.key === key)

const clean = ref({ events: true, eventsMonths: 6, snapshots: false, snapshotsScope: 'year' as 'year' | 'quarter', syncLog: true, photos: true })
const cleaning = ref(false)
const cleanResult = ref<string | null>(null)
const cleanError = ref<string | null>(null)

/** بداية الربع الحالي بتوقيت القاهرة، أو نفس الربع من السنة الماضية. */
function snapshotsCutoff(): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const year = now.getFullYear() - (clean.value.snapshotsScope === 'year' ? 1 : 0)
  return `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`
}

const nothingSelected = computed(
  () => !clean.value.events && !clean.value.snapshots && !clean.value.syncLog && !clean.value.photos,
)

async function onCleanup() {
  if (isDemo.value || nothingSelected.value) return
  const warning = backupDone.value ? t('admin.storage.confirmCleanup') : t('admin.storage.confirmNoBackup')
  if (!confirm(warning)) return

  cleaning.value = true
  cleanError.value = null
  cleanResult.value = null
  try {
    const eventsBefore = new Date()
    eventsBefore.setMonth(eventsBefore.getMonth() - clean.value.eventsMonths)
    const syncBefore = new Date(Date.now() - 30 * 86_400_000)

    const { data, error: rpcError } = await supabase.rpc('lb_admin_cleanup', {
      p_events_before: clean.value.events ? eventsBefore.toISOString() : null,
      p_snapshots_before: clean.value.snapshots ? snapshotsCutoff() : null,
      p_sync_log_before: clean.value.syncLog ? syncBefore.toISOString() : null,
    })
    if (rpcError) throw new Error(rpcError.message)
    const res = data as { events: number; snapshots: number; sync_log: number }

    let photos = 0
    const paths = usage.value?.files.orphan_paths ?? []
    if (clean.value.photos && paths.length) {
      const { data: removed, error: storageError } = await supabase.storage.from('avatars').remove(paths)
      if (storageError) throw new Error(storageError.message)
      photos = removed?.length ?? 0
    }

    cleanResult.value = t('admin.storage.cleanDone', {
      events: count(res.events),
      snapshots: count(res.snapshots),
      sync: count(res.sync_log),
      photos: count(photos),
    })
    await refresh()
  } catch (err) {
    cleanError.value = err instanceof Error ? err.message : String(err)
  } finally {
    cleaning.value = false
  }
}

const CARD = 'flex flex-col gap-3 rounded-xl border border-card-border bg-card p-5'
const BTN =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50'
const FIELD =
  'rounded-lg border border-card-border bg-page px-2 py-1 text-caption text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.storage.title') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">
          {{ t('admin.storage.hint') }}
          <template v-if="usage"> · {{ t('admin.storage.checked', { when: ago(usage.checked_at) }) }}</template>
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
        :disabled="loading"
        @click="refresh(true)"
      >
        <iconify-icon icon="mdi:refresh" aria-hidden="true" :class="loading ? 'animate-spin' : ''" />
        {{ t('admin.storage.refresh') }}
      </button>
    </header>

    <p v-if="error" role="alert" class="m-0 font-medium text-down text-sm">{{ error }}</p>

    <!-- التحذير + الاقتراحات -->
    <div
      v-if="usage && (worst !== 'ok' || backupStale)"
      role="status"
      class="flex items-start gap-3 rounded-xl border px-4 py-3"
      :class="worst === 'critical' ? 'border-down/50 bg-down/10' : worst === 'warn' ? 'border-gold/50 bg-gold/10' : 'border-accent/40 bg-accent/[0.06]'"
    >
      <iconify-icon
        :icon="worst === 'ok' ? 'mdi:backup-restore' : 'mdi:alert-outline'"
        aria-hidden="true"
        class="mt-0.5 shrink-0 text-xl"
        :class="TEXT[worst]"
      />
      <div class="flex flex-col gap-1 text-sm text-strong">
        <p v-if="worst !== 'ok'" class="m-0 font-semibold">{{ t(`admin.storage.alert.${worst}`) }}</p>
        <ul class="m-0 ps-4 text-caption text-mute leading-relaxed">
          <li v-if="backupStale">{{ t('admin.storage.suggestBackup', { when: ago(usage.last_backup) }) }}</li>
          <li v-if="worst !== 'ok'">{{ t('admin.storage.suggestCleanup') }}</li>
        </ul>
      </div>
    </div>

    <!-- العدّادات -->
    <div class="grid gap-4 md:grid-cols-3">
      <div v-for="m in meters" :key="m.key" :class="CARD">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-2 font-semibold text-strong">
            <iconify-icon :icon="ICON[m.key]" aria-hidden="true" class="text-xl text-accent-text" />
            {{ t(`admin.storage.meter.${m.key}`) }}
          </span>
          <span class="font-bold tabular-nums" dir="ltr" :class="TEXT[m.level]">{{ m.pct < 1 ? '<1' : Math.round(m.pct) }}%</span>
        </div>
        <div
          class="h-2.5 overflow-hidden rounded-full bg-page"
          role="progressbar"
          :aria-valuenow="Math.round(m.pct)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t(`admin.storage.meter.${m.key}`)"
        >
          <div class="h-full rounded-full transition-[width]" :class="BAR[m.level]" :style="{ width: `${Math.max(m.pct, 1)}%` }" />
        </div>
        <p class="m-0 text-caption text-mute tabular-nums" dir="ltr" :class="locale === 'ar' ? 'text-end' : ''">
          {{ bytes(m.used) }} / {{ bytes(m.limit) }}
        </p>
        <p class="m-0 text-caption text-dim">{{ t(`admin.storage.meterHint.${m.key}`) }}</p>
      </div>
      <div v-if="githubError && !meters.some((m) => m.key === 'github')" :class="CARD">
        <span class="flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:github" aria-hidden="true" class="text-xl text-mute" />
          {{ t('admin.storage.meter.github') }}
        </span>
        <p class="m-0 text-caption text-mute">{{ t('admin.storage.githubUnavailable') }}</p>
      </div>
    </div>

    <!-- تفاصيل ما يشغل القاعدة -->
    <div v-if="usage" :class="CARD">
      <p class="m-0 font-semibold text-strong">{{ t('admin.storage.breakdown') }}</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-caption text-mute">
              <th class="py-1.5 text-start font-semibold">{{ t('admin.storage.col.data') }}</th>
              <th class="py-1.5 text-start font-semibold">{{ t('admin.storage.col.rows') }}</th>
              <th class="py-1.5 text-start font-semibold">{{ t('admin.storage.col.size') }}</th>
              <th class="py-1.5 text-start font-semibold">{{ t('admin.storage.col.oldest') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in usage.tables" :key="row.key" class="border-t border-divider">
              <td class="py-2 pe-3 font-medium text-strong">{{ t(`admin.storage.table.${row.key}`) }}</td>
              <td class="py-2 pe-3 tabular-nums">{{ count(row.rows) }}</td>
              <td class="py-2 pe-3 tabular-nums whitespace-nowrap"><bdi dir="ltr">{{ bytes(row.bytes) }}</bdi></td>
              <td class="py-2 tabular-nums whitespace-nowrap">{{ dateOf(row.oldest) }}</td>
            </tr>
            <tr class="border-t border-divider">
              <td class="py-2 pe-3 font-medium text-strong">{{ t('admin.storage.table.photos') }}</td>
              <td class="py-2 pe-3 tabular-nums">{{ count(usage.files.count) }}</td>
              <td class="py-2 pe-3 tabular-nums whitespace-nowrap"><bdi dir="ltr">{{ bytes(usage.files.used) }}</bdi></td>
              <td class="py-2">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <!-- النسخة الاحتياطية -->
      <div :class="CARD">
        <div class="flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:backup-restore" aria-hidden="true" class="text-accent-text text-xl" />
          {{ t('admin.storage.backupTitle') }}
        </div>
        <p class="m-0 text-caption text-mute leading-relaxed">{{ t('admin.storage.backupHint') }}</p>
        <p v-if="usage" class="m-0 text-caption" :class="backupStale ? 'text-gold font-semibold' : 'text-mute'">
          {{ t('admin.storage.lastBackup', { when: ago(usage.last_backup) }) }}
        </p>
        <button type="button" :class="BTN" :disabled="backingUp" @click="onBackup">
          <iconify-icon icon="mdi:download" aria-hidden="true" />
          {{ backingUp ? t('admin.storage.backingUp') : t('admin.storage.backup') }}
        </button>
        <button
          type="button"
          class="self-start text-caption font-semibold text-accent-text underline-offset-2 hover:underline"
          @click="emit('goto', 'data')"
        >{{ t('admin.storage.excelToo') }}</button>
        <p v-if="backupDone" role="status" class="m-0 text-caption font-medium text-accent-text">{{ t('admin.storage.backupDone') }}</p>
        <p v-if="backupError" role="alert" class="m-0 text-caption text-down">{{ backupError }}</p>
      </div>

      <!-- إخلاء المساحة -->
      <div :class="CARD">
        <div class="flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:broom" aria-hidden="true" class="text-accent-text text-xl" />
          {{ t('admin.storage.cleanTitle') }}
        </div>
        <p class="m-0 text-caption text-mute leading-relaxed">{{ t('admin.storage.cleanHint') }}</p>

        <label class="flex items-start gap-2.5 text-sm text-strong">
          <input v-model="clean.events" type="checkbox" class="mt-0.5 size-4.5 accent-[var(--color-accent)]" />
          <span class="flex flex-wrap items-center gap-1.5">
            {{ t('admin.storage.cleanEvents') }}
            <select v-model.number="clean.eventsMonths" :class="FIELD" :disabled="!clean.events">
              <option :value="3">{{ t('admin.storage.months', { n: 3 }) }}</option>
              <option :value="6">{{ t('admin.storage.months', { n: 6 }) }}</option>
              <option :value="12">{{ t('admin.storage.year') }}</option>
            </select>
            <span class="text-caption text-dim">({{ t('admin.storage.total', { n: count(table('sale_events')?.rows ?? 0) }) }})</span>
          </span>
        </label>

        <label class="flex items-start gap-2.5 text-sm text-strong">
          <input v-model="clean.snapshots" type="checkbox" class="mt-0.5 size-4.5 accent-[var(--color-accent)]" />
          <span class="flex flex-col gap-1">
            <span class="flex flex-wrap items-center gap-1.5">
              {{ t('admin.storage.cleanSnapshots') }}
              <select v-model="clean.snapshotsScope" :class="FIELD" :disabled="!clean.snapshots">
                <option value="year">{{ t('admin.storage.olderThanYear') }}</option>
                <option value="quarter">{{ t('admin.storage.pastQuarters') }}</option>
              </select>
            </span>
            <span class="text-caption text-dim">{{ t('admin.storage.snapshotsNote') }}</span>
          </span>
        </label>

        <label class="flex items-start gap-2.5 text-sm text-strong">
          <input v-model="clean.syncLog" type="checkbox" class="mt-0.5 size-4.5 accent-[var(--color-accent)]" />
          {{ t('admin.storage.cleanSync') }}
        </label>

        <label class="flex items-start gap-2.5 text-sm text-strong">
          <input v-model="clean.photos" type="checkbox" class="mt-0.5 size-4.5 accent-[var(--color-accent)]" />
          <span>
            {{ t('admin.storage.cleanPhotos') }}
            <span class="text-caption text-dim" dir="auto">({{ count(usage?.files.orphan_count ?? 0) }} · {{ bytes(usage?.files.orphan_bytes ?? 0) }})</span>
          </span>
        </label>

        <p class="m-0 flex items-start gap-1.5 text-caption text-mute">
          <iconify-icon icon="mdi:shield-check-outline" aria-hidden="true" class="mt-0.5 shrink-0 text-accent-text" />
          {{ t('admin.storage.cleanSafe') }}
        </p>

        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-down/50 px-4 py-2.5 text-sm font-semibold text-down transition-colors hover:bg-down/10 disabled:opacity-50"
          :disabled="cleaning || isDemo || nothingSelected"
          @click="onCleanup"
        >
          <iconify-icon icon="mdi:broom" aria-hidden="true" />
          {{ cleaning ? t('admin.storage.cleaning') : t('admin.storage.clean') }}
        </button>
        <p v-if="isDemo" class="m-0 text-caption text-dim">{{ t('admin.storage.demoNoClean') }}</p>
        <p v-if="usage?.last_cleanup" class="m-0 text-caption text-dim">{{ t('admin.storage.lastCleanup', { when: ago(usage.last_cleanup) }) }}</p>
        <p v-if="cleanResult" role="status" class="m-0 text-caption font-medium text-accent-text">{{ cleanResult }}</p>
        <p v-if="cleanError" role="alert" class="m-0 text-caption text-down">{{ cleanError }}</p>
      </div>
    </div>
  </section>
</template>
