<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExport } from '@/composables/useExport'

const props = defineProps<{ target: HTMLElement | null }>()

const { t } = useI18n()
const { state, exportPng, exportPdf } = useExport()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

async function onPng() {
  open.value = false
  // إطار واحد حتى تُغلق القائمة قبل الالتقاط
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await exportPng(props.target)
}

function onPdf() {
  open.value = false
  requestAnimationFrame(exportPdf)
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/75 hover:text-white size-11 lg:size-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-live focus-visible:ring-offset-2 focus-visible:ring-offset-header disabled:opacity-50"
      :aria-label="t('export.label')"
      :aria-expanded="open"
      aria-haspopup="menu"
      :disabled="state === 'working'"
      @click="open = !open"
    >
      <iconify-icon
        :icon="state === 'working' ? 'mdi:loading' : 'mdi:tray-arrow-down'"
        aria-hidden="true"
        class="text-xl"
        :class="state === 'working' ? 'animate-spin' : ''"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="t('export.label')"
      class="absolute end-0 top-[calc(100%+8px)] z-50 w-52 rounded-xl border border-card-border bg-card p-1.5 text-strong shadow-[var(--shadow-panel)]"
    >
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-mute transition-colors hover:bg-accent/[0.06] hover:text-strong"
        @click="onPng"
      >
        <iconify-icon icon="mdi:image-outline" aria-hidden="true" class="text-lg" />
        {{ t('export.png') }}
      </button>
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-mute transition-colors hover:bg-accent/[0.06] hover:text-strong"
        @click="onPdf"
      >
        <iconify-icon icon="mdi:printer-outline" aria-hidden="true" class="text-lg" />
        {{ t('export.pdf') }}
      </button>
    </div>

    <p v-if="state === 'error'" role="alert" class="sr-only">{{ t('export.failed') }}</p>
  </div>
</template>
