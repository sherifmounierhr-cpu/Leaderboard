<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'
import CutoutReview from './CutoutReview.vue'

const props = defineProps<{
  modelValue: string | null
  kind: 'team' | 'agent' | 'director'
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

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  error.value = null
  // نفس حدود الـ bucket، مفحوصة هنا لنعطي رسالة فورية بدل انتظار رفض الخادم
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    error.value = t('admin.photoType')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    error.value = t('admin.photoSize')
    return
  }

  uploading.value = true
  try {
    previous.value = null
    emit('update:modelValue', await uploadPhoto(file, props.kind, props.recordId))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}

/** الصورة قبل العزل — للتراجع قبل الحفظ لو النتيجة ما عجبتش. */
const previous = ref<string | null>(null)
const cutting = ref(false)
/** العزل بيتراجع في نافذة قبل ما يترفع: درجة تنضيف الحواف + معاينة على غامق. */
const reviewing = ref(false)

async function onReviewed(blob: Blob) {
  reviewing.value = false
  if (!props.modelValue || cutting.value) return
  cutting.value = true
  error.value = null
  try {
    const file = new File([blob], 'cutout.png', { type: 'image/png' })
    const before = props.modelValue
    emit('update:modelValue', await uploadPhoto(file, props.kind, props.recordId))
    previous.value = before
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    cutting.value = false
  }
}

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
          :disabled="cutting || uploading"
          @click="reviewing = true"
        >
          <iconify-icon :icon="cutting ? 'mdi:loading' : 'mdi:auto-fix'" aria-hidden="true" :class="cutting ? 'animate-spin' : ''" />
          {{ cutting ? t('admin.cutoutWorking') : t('admin.cutoutAuto') }}
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

    <CutoutReview
      v-if="reviewing && modelValue"
      :src="modelValue"
      :name="name"
      @confirm="onReviewed"
      @cancel="reviewing = false"
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
