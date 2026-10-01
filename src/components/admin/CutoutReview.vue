<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DEFAULT_EDGE, EDGE_LEVELS, isolate, renderCutout, type RawCutout } from '@/lib/cutout'

const props = defineProps<{ src: string; name: string }>()
const emit = defineEmits<{ confirm: [Blob]; cancel: [] }>()

const { t } = useI18n()

const raw = ref<RawCutout | null>(null)
const level = ref<number>(DEFAULT_EDGE)
const blob = ref<Blob | null>(null)
const preview = ref<string | null>(null)
const busy = ref(true)
const error = ref<string | null>(null)
/** الهالة البيضا بتبان على الغامق بس — فده الافتراضي للمراجعة. */
const backdrop = ref<'dark' | 'light' | 'checker'>('dark')

async function render() {
  if (!raw.value) return
  busy.value = true
  try {
    const b = await renderCutout(raw.value, level.value)
    if (preview.value) URL.revokeObjectURL(preview.value)
    blob.value = b
    preview.value = URL.createObjectURL(b)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    raw.value = await isolate(props.src)
    await render()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    busy.value = false
  }
})

watch(level, () => void render())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('cancel')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  if (preview.value) URL.revokeObjectURL(preview.value)
})

const BACKDROPS = {
  dark: 'bg-[linear-gradient(160deg,#1d3a2c,#0c1410)]',
  light: 'bg-[#f3f4f6]',
  checker: 'review-checker',
} as const
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('cancel')">
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="t('admin.cutoutReviewTitle', { name })"
      class="flex max-h-full w-full max-w-3xl flex-col gap-4 overflow-auto rounded-2xl border border-card-border bg-card p-5 shadow-2xl"
    >
      <header class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.cutoutReviewTitle', { name }) }}</h2>
          <p class="m-0 text-mute text-sm">{{ t('admin.cutoutReviewHint') }}</p>
        </div>
        <button type="button" class="rounded-lg p-1.5 text-mute hover:text-strong" :aria-label="t('admin.cancel')" @click="emit('cancel')">
          <iconify-icon icon="mdi:close" aria-hidden="true" class="text-xl" />
        </button>
      </header>

      <div class="grid gap-3 sm:grid-cols-2">
        <figure class="m-0 flex flex-col gap-1.5">
          <figcaption class="text-caption font-semibold text-mute">{{ t('admin.cutoutBefore') }}</figcaption>
          <div class="aspect-square overflow-hidden rounded-xl bg-avatar">
            <img :src="src" alt="" class="size-full object-contain" />
          </div>
        </figure>
        <figure class="m-0 flex flex-col gap-1.5">
          <figcaption class="flex items-center justify-between text-caption font-semibold text-mute">
            <span>{{ t('admin.cutoutAfter') }}</span>
            <span class="flex gap-1">
              <button
                v-for="b in (['dark', 'light', 'checker'] as const)"
                :key="b"
                type="button"
                class="rounded-md border px-2 py-0.5 text-[11px]"
                :class="backdrop === b ? 'border-accent text-accent-text' : 'border-card-border text-mute'"
                @click="backdrop = b"
              >{{ t(`admin.cutoutBg.${b}`) }}</button>
            </span>
          </figcaption>
          <div class="relative aspect-square overflow-hidden rounded-xl" :class="BACKDROPS[backdrop]">
            <img v-if="preview" :src="preview" alt="" class="size-full object-contain object-bottom" />
            <div v-if="busy" class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 text-white text-sm">
              <iconify-icon icon="mdi:loading" aria-hidden="true" class="animate-spin text-3xl" />
              {{ raw ? t('admin.cutoutRefining') : t('admin.cutoutWorking') }}
            </div>
          </div>
        </figure>
      </div>

      <label class="flex flex-col gap-2">
        <span class="flex items-center justify-between text-caption font-semibold text-mute">
          <span>{{ t('admin.cutoutEdge') }}</span>
          <span class="text-strong">{{ t(`admin.cutoutEdgeLevel.${level}`) }}</span>
        </span>
        <input
          v-model.number="level"
          type="range"
          :min="EDGE_LEVELS[0]"
          :max="EDGE_LEVELS[EDGE_LEVELS.length - 1]"
          step="1"
          :disabled="!raw"
          class="accent-[var(--color-accent)]"
        />
        <span class="text-eyebrow text-dim">{{ t('admin.cutoutEdgeHint') }}</span>
      </label>

      <p v-if="error" role="alert" class="m-0 text-caption text-down">{{ error }}</p>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy || !blob"
          @click="blob && emit('confirm', blob)"
        >{{ t('admin.cutoutConfirm') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong"
          @click="emit('cancel')"
        >{{ t('admin.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-checker {
  background-color: #fff;
  background-image: conic-gradient(#d9dde2 25%, transparent 0 50%, #d9dde2 0 75%, transparent 0);
  background-size: 16px 16px;
}
</style>
