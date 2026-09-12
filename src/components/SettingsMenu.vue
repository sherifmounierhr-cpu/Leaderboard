<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ROTATE_INTERVALS, settings } from '@/composables/useSettings'
import type { LocaleName, ThemeName } from '@/lib/types'

const props = defineProps<{ open: boolean; isFullscreen: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; fullscreen: [] }>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)

function onDocumentClick(event: MouseEvent) {
  if (!props.open) return
  if (root.value && !root.value.contains(event.target as Node)) emit('update:open', false)
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))

const themes: ThemeName[] = ['daylight', 'midnight']
const locales: LocaleName[] = ['ar', 'en']
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/75 hover:text-white size-11 lg:size-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-live focus-visible:ring-offset-2 focus-visible:ring-offset-header"
      :aria-label="t('settings.open')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="emit('update:open', !open)"
    >
      <iconify-icon icon="mdi:cog-outline" aria-hidden="true" class="text-xl" />
    </button>

    <div
      v-if="open"
      role="dialog"
      :aria-label="t('settings.title')"
      class="absolute end-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-card-border bg-card p-4 text-strong shadow-[var(--shadow-panel)]"
    >
      <!-- المظهر -->
      <p class="m-0 mb-2 font-semibold text-caption uppercase tracking-[0.08em] text-mute">
        {{ t('settings.theme') }}
      </p>
      <div class="mb-4 grid grid-cols-2 gap-2">
        <button
          v-for="theme in themes"
          :key="theme"
          type="button"
          class="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            settings.theme === theme
              ? 'border-accent bg-accent/10 text-accent-text'
              : 'border-card-border text-mute hover:text-strong'
          "
          :aria-pressed="settings.theme === theme"
          @click="settings.theme = theme"
        >
          {{ t(`settings.${theme}`) }}
        </button>
      </div>

      <!-- اللغة -->
      <p class="m-0 mb-2 font-semibold text-caption uppercase tracking-[0.08em] text-mute">
        {{ t('settings.language') }}
      </p>
      <div class="mb-4 grid grid-cols-2 gap-2">
        <button
          v-for="loc in locales"
          :key="loc"
          type="button"
          class="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors"
          :class="
            settings.locale === loc
              ? 'border-accent bg-accent/10 text-accent-text'
              : 'border-card-border text-mute hover:text-strong'
          "
          :aria-pressed="settings.locale === loc"
          @click="settings.locale = loc"
        >
          {{ loc === 'ar' ? 'العربية' : 'English' }}
        </button>
      </div>

      <!-- التبديل التلقائي -->
      <label class="mb-3 flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{{ t('settings.rotate') }}</span>
        <input v-model="settings.rotate" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
      </label>

      <div v-if="settings.rotate" class="mb-4">
        <p class="m-0 mb-2 font-semibold text-caption uppercase tracking-[0.08em] text-mute">
          {{ t('settings.interval') }}
        </p>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="secs in ROTATE_INTERVALS"
            :key="secs"
            type="button"
            class="rounded-md border px-2 py-1.5 text-caption font-semibold tabular-nums transition-colors"
            :class="
              settings.rotateSeconds === secs
                ? 'border-accent bg-accent/10 text-accent-text'
                : 'border-card-border text-mute hover:text-strong'
            "
            :aria-pressed="settings.rotateSeconds === secs"
            @click="settings.rotateSeconds = secs"
          >
            {{ t('settings.seconds', { n: secs }) }}
          </button>
        </div>
      </div>

      <label class="mb-3 flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{{ t('settings.keepAwake') }}</span>
        <input v-model="settings.keepAwake" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
      </label>

      <button
        type="button"
        class="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong"
        @click="emit('fullscreen')"
      >
        <iconify-icon
          :icon="isFullscreen ? 'mdi:fullscreen-exit' : 'mdi:fullscreen'"
          aria-hidden="true"
          class="text-lg"
        />
        {{ isFullscreen ? t('settings.exitFullscreen') : t('settings.fullscreen') }}
      </button>

      <a
        href="?admin=1"
        class="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong"
      >
        <iconify-icon icon="mdi:table-edit" aria-hidden="true" class="text-lg" />
        {{ t('admin.open') }}
      </a>

      <p class="m-0 text-eyebrow leading-relaxed text-dim">{{ t('settings.shortcuts') }}</p>
    </div>
  </div>
</template>
