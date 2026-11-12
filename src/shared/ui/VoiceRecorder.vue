<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { readDuration } from '@/composables/useScreenAdmin'

/**
 * رسالة صوتية: تسجيل مباشر من الميكروفون (بمؤشر مستوى حي) أو رفع ملف.
 * الناتج Blob ومدته — المدة من عدّاد التسجيل نفسه، لأن webm من MediaRecorder
 * مالوش مدة في الـ metadata على Chrome.
 */
export interface Voice {
  blob: Blob
  seconds: number
}

const props = defineProps<{ modelValue: Voice | null }>()
const emit = defineEmits<{ 'update:modelValue': [Voice | null] }>()
const { t } = useI18n()

const MAX_SECONDS = 180
const MAX_FILE_BYTES = 15 * 1024 * 1024

const state = ref<'idle' | 'recording'>('idle')
const seconds = ref(0)
const levels = ref<number[]>(Array(24).fill(0.08))
const error = ref<string | null>(null)
const url = ref<string | null>(null)

let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let raf = 0
let tick: ReturnType<typeof setInterval> | null = null
let started = 0
let chunks: Blob[] = []

watch(
  () => props.modelValue,
  (v) => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = v ? URL.createObjectURL(v.blob) : null
  },
  { immediate: true },
)

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

async function start() {
  error.value = null
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    error.value = t('owners.noMic')
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (err) {
    error.value = (err as DOMException)?.name === 'NotAllowedError' ? t('owners.micDenied') : t('owners.noMic')
    return
  }
  const mime = pickMime()
  recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || mime || 'audio/webm' })
    const length = Math.max(0.5, (Date.now() - started) / 1000)
    cleanup()
    if (blob.size) emit('update:modelValue', { blob, seconds: Math.round(length * 10) / 10 })
  }
  recorder.start(250)
  started = Date.now()
  seconds.value = 0
  state.value = 'recording'
  tick = setInterval(() => {
    seconds.value = (Date.now() - started) / 1000
    if (seconds.value >= MAX_SECONDS) stopRecording()
  }, 200)

  // مؤشر مستوى الصوت: الميكروفون شغّال فعلاً ومسموع
  try {
    audioCtx = new AudioContext()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const loop = () => {
      analyser.getByteFrequencyData(data)
      levels.value = levels.value.map((_, i) => Math.max(0.08, (data[i + 1] ?? 0) / 255))
      raf = requestAnimationFrame(loop)
    }
    loop()
  } catch { /* المؤشر تجميلي — التسجيل شغّال من غيره */ }
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
}

function cleanup() {
  if (tick) clearInterval(tick)
  tick = null
  cancelAnimationFrame(raf)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  void audioCtx?.close()
  audioCtx = null
  recorder = null
  state.value = 'idle'
  levels.value = Array(24).fill(0.08)
}

async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = null
  if (!file.type.startsWith('audio/')) {
    error.value = t('owners.audioType')
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    error.value = t('owners.audioSize')
    return
  }
  const length = (await readDuration(file)) ?? 30
  emit('update:modelValue', { blob: file, seconds: Math.round(length * 10) / 10 })
}

function clockOf(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

onBeforeUnmount(() => {
  if (recorder && recorder.state !== 'inactive') {
    recorder.onstop = null
    recorder.stop()
  }
  cleanup()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <!-- تسجيل جاري -->
    <div
      v-if="state === 'recording'"
      class="flex items-center gap-3 rounded-xl border border-down/40 bg-down/[0.06] px-3 py-2.5"
      role="status"
    >
      <span class="vr-dot shrink-0" aria-hidden="true" />
      <span class="tabular-nums font-bold text-strong">{{ clockOf(seconds) }}</span>
      <span class="flex h-8 flex-1 items-center gap-[3px]" aria-hidden="true">
        <span
          v-for="(l, i) in levels"
          :key="i"
          class="w-1 flex-1 rounded-full bg-down/80 transition-transform duration-75"
          :style="{ height: '100%', transform: `scaleY(${l})` }"
        />
      </span>
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-down px-4 text-sm font-bold text-white"
        @click="stopRecording"
      >
        <iconify-icon icon="mdi:stop" aria-hidden="true" class="text-lg" />
        {{ t('owners.stop') }}
      </button>
    </div>

    <!-- تسجيل جاهز -->
    <div v-else-if="modelValue && url" class="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-2.5">
      <iconify-icon icon="mdi:microphone" aria-hidden="true" class="ms-1 text-xl text-accent-text" />
      <audio :src="url" controls preload="metadata" class="h-11 min-w-0 flex-1" />
      <span class="tabular-nums text-caption font-semibold text-mute">{{ clockOf(modelValue.seconds) }}</span>
      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-mute transition-colors hover:text-down"
        @click="emit('update:modelValue', null)"
      >
        <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" class="text-lg" />
        {{ t('owners.removeVoice') }}
      </button>
    </div>

    <!-- مفيش صوت لسه -->
    <div v-else class="flex flex-wrap gap-2">
      <button
        type="button"
        class="vr-record inline-flex min-h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#0f7e76,#0b635d)] px-5 text-sm font-bold text-white shadow-[0_8px_20px_-10px_#0f7e76] transition-transform active:scale-[0.97]"
        @click="start"
      >
        <span class="inline-flex size-7 items-center justify-center rounded-full bg-white/15">
          <iconify-icon icon="mdi:microphone" aria-hidden="true" class="text-lg" />
        </span>
        {{ t('owners.record') }}
      </button>
      <label class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-card-border px-4 text-sm font-semibold text-mute transition-colors hover:border-accent/50 hover:text-strong focus-within:ring-2 focus-within:ring-accent">
        <iconify-icon icon="mdi:file-music-outline" aria-hidden="true" class="text-lg" />
        {{ t('owners.uploadVoice') }}
        <input type="file" accept="audio/*" class="sr-only" @change="pickFile" />
      </label>
    </div>

    <p v-if="error" role="alert" class="m-0 text-caption text-down">{{ error }}</p>
  </div>
</template>

<style scoped>
.vr-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  background: var(--color-down);
  animation: vr-blink 1s ease-in-out infinite;
}
@keyframes vr-blink {
  50% { opacity: 0.25; }
}
@media (prefers-reduced-motion: reduce) {
  .vr-dot { animation: none; }
}
</style>
