<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'
import type { ImportSummary } from '@/lib/workbook'

const { t } = useI18n()
const { year, exportYear, importFile } = useAdminData()

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

    <p v-if="error" role="alert" class="m-0 font-medium text-down text-sm">{{ error }}</p>

    <p
      v-if="result"
      role="status"
      class="m-0 rounded-lg border border-accent/40 bg-accent/[0.06] px-4 py-3 font-medium text-accent-text text-sm"
    >
      {{ t('admin.importDone', { teams: result.teams, agents: result.agents, periods: result.periods }) }}
      <span v-if="result.skipped" class="text-mute">
        {{ t('admin.importSkipped', { n: result.skipped }) }}
      </span>
    </p>
  </section>
</template>
