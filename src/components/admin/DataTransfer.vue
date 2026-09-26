<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'
import { useAuth } from '@/composables/useAuth'
import { collectBackup, downloadText, renderBackupHtml } from '@/lib/backup'
import type { ImportSummary } from '@/lib/workbook'

const { t } = useI18n()
const { year, exportYear, importFile, wipeData } = useAdminData()
const { isAdmin } = useAuth()

const exporting = ref(false)
const importing = ref(false)
const result = ref<ImportSummary | null>(null)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onExport() {
  exporting.value = true
  error.value = null
  try {
    await exportYear()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    exporting.value = false
  }
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  error.value = null
  result.value = null
  wiped.value = null
  try {
    result.value = await importFile(file)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    importing.value = false
    // تفريغ الحقل حتى يمكن رفع نفس الملف ثانيةً بعد تعديله
    input.value = ''
  }
}

// ------------------------------------------------------------ مسح البيانات
// للمسؤول الكامل فقط (الخادم يرفض غيره). نسخة احتياطية تنزل تلقائياً قبل
// المسح، ولو فشلت ما بيتمسحش حاجة.
const scope = ref<'sales' | 'all'>('sales')
const confirmWord = ref('')
const wiping = ref(false)
const wiped = ref<Record<string, number> | null>(null)
const expectedWord = computed(() => t('admin.wipe.word'))
const canWipe = computed(() => confirmWord.value.trim() === expectedWord.value && !wiping.value)

async function onWipe() {
  if (!canWipe.value) return
  const question = t(scope.value === 'all' ? 'admin.wipe.confirmAll' : 'admin.wipe.confirmSales')
  if (!confirm(question)) return

  wiping.value = true
  error.value = null
  result.value = null
  wiped.value = null
  try {
    const backup = await collectBackup()
    downloadText(renderBackupHtml(backup), `everest-leaderboard-backup-before-wipe-${backup.created_at.slice(0, 10)}.html`)
    wiped.value = await wipeData(scope.value, confirmWord.value.trim())
    confirmWord.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    wiping.value = false
  }
}

const CARD = 'flex flex-col gap-3 rounded-xl border border-card-border bg-card p-6'
const BTN =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.data') }}</h2>
      <p class="m-0 mt-1 text-caption text-mute">{{ t('admin.dataHint', { year }) }}</p>
    </header>

    <div class="grid gap-4 md:grid-cols-2">
      <div :class="CARD">
        <div class="flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:file-excel-outline" aria-hidden="true" class="text-accent-text text-xl" />
          {{ t('admin.exportExcel') }}
        </div>
        <p class="m-0 text-caption text-mute">{{ t('admin.exportHint') }}</p>
        <button type="button" :class="BTN" :disabled="exporting" @click="onExport">
          <iconify-icon icon="mdi:download" aria-hidden="true" />
          {{ exporting ? t('admin.exporting') : t('admin.exportExcel') }}
        </button>
      </div>

      <div :class="CARD">
        <div class="flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:upload-outline" aria-hidden="true" class="text-accent-text text-xl" />
          {{ t('admin.importExcel') }}
        </div>
        <p class="m-0 text-caption text-mute">{{ t('admin.importHint') }}</p>

        <input
          ref="fileInput"
          type="file"
          accept=".xlsx"
          class="sr-only"
          @change="onPick"
        />
        <button
          type="button"
          :class="BTN"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          <iconify-icon icon="mdi:microsoft-excel" aria-hidden="true" />
          {{ importing ? t('admin.importing') : t('admin.importExcel') }}
        </button>
      </div>
    </div>

    <p v-if="error" role="alert" class="m-0 whitespace-pre-line font-medium text-down text-sm">{{ error }}</p>

    <p
      v-if="result"
      role="status"
      class="m-0 rounded-lg border border-accent/40 bg-accent/[0.06] px-4 py-3 font-medium text-accent-text text-sm"
    >
      {{ t('admin.importDone', { teams: result.teams, agents: result.agents, periods: result.periods }) }}
      {{ t('admin.importDeals', { n: result.deals }) }}
      <span v-if="result.dealsSkipped" class="text-mute">
        {{ t('admin.importDealsSkipped', { n: result.dealsSkipped }) }}
      </span>
      <span v-if="result.skipped" class="text-mute">
        {{ t('admin.importSkipped', { n: result.skipped }) }}
      </span>
    </p>

    <!-- مسح البيانات: منطقة خطر، للمسؤول الكامل فقط -->
    <div v-if="isAdmin" class="flex flex-col gap-4 rounded-xl border border-down/40 bg-down/[0.04] p-6">
      <div class="flex items-center gap-2 font-semibold text-down">
        <iconify-icon icon="mdi:delete-alert-outline" aria-hidden="true" class="text-xl" />
        {{ t('admin.wipe.title') }}
      </div>
      <p class="m-0 text-caption text-mute">{{ t('admin.wipe.hint') }}</p>

      <div class="grid gap-2 sm:grid-cols-2">
        <label
          v-for="s in (['sales', 'all'] as const)"
          :key="s"
          class="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 transition-colors"
          :class="scope === s ? 'border-down' : 'border-card-border hover:border-mute'"
        >
          <input v-model="scope" type="radio" name="wipe-scope" :value="s" class="mt-1 accent-[var(--color-down)]" />
          <span class="flex flex-col">
            <span class="text-sm font-semibold text-strong">{{ t(`admin.wipe.scope.${s}`) }}</span>
            <span class="text-caption text-mute leading-snug">{{ t(`admin.wipe.scopeHint.${s}`) }}</span>
          </span>
        </label>
      </div>

      <p class="m-0 text-caption text-mute">{{ t('admin.wipe.keeps') }}</p>

      <label class="flex max-w-sm flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('admin.wipe.typeWord', { word: expectedWord }) }}</span>
        <input
          v-model="confirmWord"
          type="text"
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-down"
        />
      </label>

      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-down px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        :disabled="!canWipe"
        @click="onWipe"
      >
        <iconify-icon icon="mdi:delete-forever-outline" aria-hidden="true" />
        {{ wiping ? t('admin.wipe.working') : t('admin.wipe.button') }}
      </button>

      <p
        v-if="wiped"
        role="status"
        class="m-0 rounded-lg border border-card-border bg-card px-4 py-3 font-medium text-strong text-sm"
      >
        {{ t('admin.wipe.done', { deals: wiped.deals, sales: wiped.sales, targets: wiped.targets, agents: wiped.agents, teams: wiped.teams }) }}
      </p>
    </div>
  </section>
</template>
