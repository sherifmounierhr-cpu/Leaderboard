<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'
import ImageStudio from './ImageStudio.vue'

const props = defineProps<{
  modelValue: string | null
  kind: 'team' | 'agent' | 'director' | 'user'
  recordId: string | null
  name: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const { t } = useI18n()
const { uploadPhoto } = useAdminData()

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref<string | null>(null)

const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
)

/**
 * أي صورة بتعدّي على استوديو الصورة قبل الرفع: عزل، مؤثرات، وتصغير — فحدّ
 * الـ 2 ميجا بتاع المخزن ما بقاش بيرفض صور الموبايل الكبيرة.
 */
const studio = ref<{ source: Blob | string; existing: boolean } | null>(null)

function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (input.value) input.value.value = ''
  if (!file) return
  error.value = null
  if (!file.type.startsWith('image/')) {
    error.value = t('admin.photoType')
    return
  }
  studio.value = { source: file, existing: false }
}

async function onStudio(blob: Blob) {
  const existing = studio.value?.existing ?? false
  studio.value = null
  uploading.value = true
  error.value = null
  try {
    const ext = blob.type === 'image/webp' ? 'webp' : 'png'
    const before = props.modelValue
    emit('update:modelValue', await uploadPhoto(new File([blob], `photo.${ext}`, { type: blob.type }), props.kind, props.recordId))
    // تعديل صورة موجودة يتراجع عنه قبل الحفظ؛ صورة جديدة مالهاش «قبل»
    previous.value = existing ? before : null
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    uploading.value = false
  }
}

/** الصورة قبل التعديل — للتراجع قبل الحفظ لو النتيجة ما عجبتش. */
const previous = ref<string | null>(null)

function undoCutout() {
  emit('update:modelValue', previous.value)
  previous.value = null
}
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- بعد العزل: مربعات شطرنج ورا المعاينة عشان الشفافية تبان -->
    <div
      class="relative size-16 shrink-0 overflow-hidden rounded-xl outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center"
      :class="previous ? 'photo-checker' : 'bg-avatar'"
    >
      <span aria-hidden="true" class="font-bold text-avatar-text text-lg leading-none">
        {{ initials }}
      </span>
      <span
        v-if="modelValue"
        aria-hidden="true"
        class="absolute inset-0 bg-cover bg-center"
        :style="{ backgroundImage: `url('${modelValue}')` }"
      />
    </div>

    <div class="flex flex-col gap-1.5 min-w-0">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
          :disabled="uploading"
          @click="input?.click()"
        >
          <iconify-icon
            :icon="uploading ? 'mdi:loading' : 'mdi:tray-arrow-up'"
            aria-hidden="true"
            :class="uploading ? 'animate-spin' : ''"
          />
          {{ uploading ? t('admin.uploading') : t('admin.uploadPhoto') }}
        </button>

        <button
          v-if="modelValue && !previous"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
          :disabled="uploading"
          @click="studio = { source: modelValue, existing: true }"
        >
          <iconify-icon icon="mdi:auto-fix" aria-hidden="true" />
          {{ t('studio.edit') }}
        </button>
        <button
          v-if="previous"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
          @click="undoCutout"
        >
          <iconify-icon icon="mdi:undo" aria-hidden="true" />
          {{ t('admin.cutoutUndo') }}
        </button>

        <button
          v-if="modelValue"
          type="button"
          class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          @click="emit('update:modelValue', null); previous = null"
        >
          {{ t('admin.removePhoto') }}
        </button>
      </div>

      <p class="m-0 text-eyebrow text-dim">{{ previous ? t('admin.cutoutSaveHint') : t('admin.photoHint') }}</p>
      <p v-if="error" class="m-0 text-caption text-down">{{ error }}</p>
    </div>

    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="sr-only"
      :aria-label="t('admin.uploadPhoto')"
      @change="onPick"
    />

    <ImageStudio
      v-if="studio"
      :source="studio.source"
      :name="name"
      :purpose="kind === 'team' ? 'photo' : 'person'"
      :max-edge="1200"
      @confirm="onStudio"
      @cancel="studio = null"
    />
  </div>
</template>

<style scoped>
.photo-checker {
  background-color: #fff;
  background-image: conic-gradient(#d9dde2 25%, transparent 0 50%, #d9dde2 0 75%, transparent 0);
  background-size: 10px 10px;
}
</style>
