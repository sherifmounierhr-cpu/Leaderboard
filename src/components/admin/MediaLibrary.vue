<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MediaFile } from '@/lib/types'
import { MAX_AUDIO_BYTES, useScreenAdmin } from '@/composables/useScreenAdmin'
import { mediaUrl } from '@/composables/useBoardMedia'
import { useAudioPlayer } from '@/composables/useAudioPlayer'

/** مكتبة الصوتيات: أغاني الاحتفال ومقاطع الرسائل، رفع وتجربة وحذف. */
const { t } = useI18n()
const { media, settings, uploadMedia, deleteMedia } = useScreenAdmin()
const { play, stop, playing } = useAudioPlayer()

const kind = ref<MediaFile['kind']>('song')
const name = ref('')
const file = ref<File | null>(null)
const dragging = ref(false)
const uploading = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)
const playingId = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

function pick(f: File | undefined | null) {
  message.value = null
  if (!f) return
  if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|wav|webm)$/i.test(f.name)) {
    message.value = { ok: false, text: t('screen.notAudio') }
    return
  }
  if (f.size > MAX_AUDIO_BYTES) {
    message.value = { ok: false, text: t('screen.tooBig', { mb: 15 }) }
    return
  }
  file.value = f
  if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '').slice(0, 80)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  pick(e.dataTransfer?.files?.[0])
}

async function onUpload() {
  if (!file.value) return
  uploading.value = true
  message.value = null
  try {
    await uploadMedia(file.value, kind.value, name.value)
    message.value = { ok: true, text: t('screen.uploaded', { name: name.value || file.value.name }) }
    file.value = null
    name.value = ''
    if (input.value) input.value.value = ''
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    message.value = { ok: false, text: text === 'MAX_SIZE' ? t('screen.tooBig', { mb: 15 }) : text }
  } finally {
    uploading.value = false
  }
}

async function onDelete(f: MediaFile) {
  if (!confirm(t('screen.confirmDelete', { name: f.name }))) return
  message.value = null
  try {
    if (playingId.value === f.id) togglePlay(f)
    await deleteMedia(f)
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

function togglePlay(f: MediaFile) {
  if (playingId.value === f.id && playing.value) {
    stop()
    playingId.value = null
    return
  }
  playingId.value = f.id
  void play(mediaUrl(f.path), settings.value.volume, f.duration_s ?? 600)
}

const groups = computed(() =>
  (['song', 'clip'] as const).map((k) => ({ kind: k, files: media.value.filter((f) => f.kind === k) })),
)

const mmss = (s: number | null) => {
  if (s === null) return '—'
  const total = Math.round(s)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]">
    <div class="flex items-start gap-3">
      <iconify-icon icon="mdi:music-box-multiple-outline" aria-hidden="true" class="mt-0.5 text-accent-text text-2xl" />
      <div class="flex flex-col gap-1">
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('screen.libraryTitle') }}</h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('screen.libraryHint', { mb: 15 }) }}</p>
      </div>
    </div>

    <!-- الرفع -->
    <div
      class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors"
      :class="dragging ? 'border-accent bg-accent/[0.06]' : 'border-card-border'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <iconify-icon icon="mdi:cloud-upload-outline" aria-hidden="true" class="text-accent-text text-3xl" />
      <p class="m-0 text-sm text-strong font-medium">
        <template v-if="file">{{ file.name }} · {{ mb(file.size) }}</template>
        <template v-else>{{ t('screen.dropHere') }}</template>
      </p>
      <input ref="input" type="file" accept="audio/*" class="sr-only" @change="pick(($event.target as HTMLInputElement).files?.[0])" />
      <button type="button" class="rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute hover:text-strong" @click="input?.click()">
        {{ t('screen.chooseFile') }}
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('screen.fileName') }}</span>
        <input v-model="name" type="text" maxlength="80" :class="FIELD" :placeholder="t('screen.fileNamePlaceholder')" />
      </label>
      <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend class="mb-1.5 font-semibold text-caption text-mute">{{ t('screen.kind') }}</legend>
        <div class="flex rounded-lg border border-card-border bg-page p-1">
          <button
            v-for="k in (['song', 'clip'] as const)"
            :key="k"
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-semibold transition-colors"
            :class="kind === k ? 'bg-accent text-white' : 'text-mute hover:text-strong'"
            :aria-pressed="kind === k"
            @click="kind = k"
          >{{ t(`screen.kind_${k}`) }}</button>
        </div>
      </fieldset>
    </div>

    <p
      v-if="message"
      :role="message.ok ? 'status' : 'alert'"
      class="m-0 text-sm font-medium"
      :class="message.ok ? 'text-accent-text' : 'text-down'"
    >{{ message.text }}</p>

    <button
      type="button"
      class="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      :disabled="!file || uploading"
      @click="onUpload"
    >
      <iconify-icon icon="mdi:upload" aria-hidden="true" class="text-lg" />
      {{ uploading ? t('screen.uploading') : t('screen.upload') }}
    </button>

    <!-- القائمة -->
    <div v-for="g in groups" :key="g.kind" class="flex flex-col gap-2">
      <h3 class="m-0 mt-2 font-semibold text-strong text-sm">{{ t(`screen.group_${g.kind}`) }} <span class="text-dim font-medium">({{ g.files.length }})</span></h3>
      <p v-if="!g.files.length" class="m-0 text-caption text-dim">{{ t('screen.emptyGroup') }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li v-for="f in g.files" :key="f.id" class="flex items-center gap-3 rounded-lg border border-card-border bg-page px-3 py-2">
          <button
            type="button"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent-text transition-colors hover:bg-accent hover:text-white"
            :aria-label="playingId === f.id && playing ? t('screen.stop') : t('screen.play')"
            @click="togglePlay(f)"
          >
            <iconify-icon :icon="playingId === f.id && playing ? 'mdi:stop' : 'mdi:play'" aria-hidden="true" class="text-lg" />
          </button>
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-semibold text-strong text-sm" dir="auto">{{ f.name }}</span>
            <span class="text-caption text-mute tabular-nums">{{ mmss(f.duration_s) }} · {{ mb(f.size_bytes) }}</span>
          </div>
          <span v-if="f.id === settings.celebration_song_id" class="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-caption font-semibold text-gold">
            {{ t('screen.isDefault') }}
          </span>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
            :aria-label="t('admin.delete')"
            @click="onDelete(f)"
          >
            <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
