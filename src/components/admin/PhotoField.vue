<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'

const props = defineProps<{
  modelValue: string | null
  kind: 'team' | 'agent'
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
    emit('update:modelValue', await uploadPhoto(file, props.kind, props.recordId))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    uploading.value = false
    if (input.value) input.value.value = ''
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      class="relative size-16 shrink-0 overflow-hidden rounded-xl bg-avatar outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center"
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
          v-if="modelValue"
          type="button"
          class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          @click="emit('update:modelValue', null)"
        >
          {{ t('admin.removePhoto') }}
        </button>
      </div>

      <p class="m-0 text-eyebrow text-dim">{{ t('admin.photoHint') }}</p>
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
  </div>
</template>
