<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDirectors, type DirectorDraft } from '@/composables/useDirectors'
import type { DirectorRow } from '@/lib/types'
import PhotoField from './PhotoField.vue'

const { directors, saveDirector, deleteDirector, load } = useDirectors()
const { t, locale } = useI18n()

onMounted(load)

type Draft = {
  id: string | null
  name: string
  name_ar: string
  title: string
  title_ar: string
  photo_url: string | null
  position: number
  active: boolean
}

const editing = ref<Draft | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

function blank(): Draft {
  return {
    id: null,
    name: '',
    name_ar: '',
    title: '',
    title_ar: '',
    photo_url: null,
    position: directors.value.length,
    active: true,
  }
}

function edit(d: DirectorRow) {
  formError.value = null
  editing.value = {
    id: d.id,
    name: d.name,
    name_ar: d.name_ar ?? '',
    title: d.title,
    title_ar: d.title_ar ?? '',
    photo_url: d.photo_url,
    position: d.position,
    active: d.active,
  }
}

async function submit() {
  if (!editing.value) return
  saving.value = true
  formError.value = null
  try {
    const draft: DirectorDraft = {
      id: editing.value.id,
      name: editing.value.name,
      name_ar: editing.value.name_ar || null,
      title: editing.value.title,
      title_ar: editing.value.title_ar || null,
      photo_url: editing.value.photo_url,
      position: editing.value.position,
      active: editing.value.active,
    }
    await saveDirector(draft)
    editing.value = null
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function remove(d: DirectorRow) {
  if (!confirm(t('admin.confirmDeleteDirector', { name: d.name }))) return
  try {
    await deleteDirector(d.id)
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]">
    <header class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="admin-card-title">
          {{ t('admin.directors') }}
          <span class="font-medium text-mute text-sm">({{ directors.length }})</span>
        </h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('admin.directorsHint') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
        @click="editing = blank(); formError = null"
      >
        <iconify-icon icon="mdi:plus" aria-hidden="true" />
        {{ t('admin.addDirector') }}
      </button>
    </header>

    <form
      v-if="editing"
      class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-page p-4 lg:p-5"
      @submit.prevent="submit"
    >
      <PhotoField
        v-model="editing.photo_url"
        kind="director"
        :record-id="editing.id"
        :name="editing.name || '؟'"
      />

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameEn') }} *</span>
          <input v-model="editing.name" :class="FIELD" required placeholder="Sherif Mounier" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameAr') }}</span>
          <input v-model="editing.name_ar" :class="FIELD" placeholder="شريف منير" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.titleEn') }} *</span>
          <input v-model="editing.title" :class="FIELD" required placeholder="CEO" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.titleAr') }}</span>
          <input v-model="editing.title_ar" :class="FIELD" placeholder="الرئيس التنفيذي" />
        </label>
      </div>

      <label class="flex flex-col gap-1.5 max-w-[12rem]">
        <span class="font-semibold text-caption text-mute">{{ t('admin.directorOrder') }}</span>
        <input v-model.number="editing.position" type="number" min="0" :class="FIELD" />
      </label>

      <label class="flex items-center gap-2.5 text-sm font-semibold text-strong">
        <input v-model="editing.active" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
        {{ t('admin.active') }}
      </label>

      <p v-if="formError" role="alert" class="m-0 text-caption text-down">{{ formError }}</p>

      <div class="flex items-center gap-2">
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="saving"
        >{{ saving ? t('admin.saving') : t('admin.save') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong"
          @click="editing = null"
        >{{ t('admin.cancel') }}</button>
      </div>
    </form>

    <ul class="m-0 p-0 list-none flex flex-col gap-2">
      <li
        v-for="d in directors"
        :key="d.id"
        class="flex items-center gap-3 admin-row rounded-xl border border-card-border bg-page px-4 py-3"
        :class="d.active ? '' : 'opacity-60'"
      >
        <span
          class="size-11 shrink-0 overflow-hidden rounded-full bg-avatar bg-cover bg-center outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center font-bold text-avatar-text text-caption"
          :style="d.photo_url ? { backgroundImage: `url('${d.photo_url}')` } : undefined"
        >{{ d.photo_url ? '' : d.name.slice(0, 2).toUpperCase() }}</span>

        <div class="min-w-0 flex-1">
          <p class="m-0 font-semibold text-strong truncate">{{ locale === 'ar' && d.name_ar ? d.name_ar : d.name }}</p>
          <p class="m-0 text-caption text-mute truncate">
            {{ locale === 'ar' && d.title_ar ? d.title_ar : d.title }}<template v-if="!d.active"> · {{ t('admin.inactive') }}</template>
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
          @click="edit(d)"
        >{{ t('admin.edit') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          :aria-label="t('admin.delete')"
          @click="remove(d)"
        >
          <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
        </button>
      </li>
      <li v-if="!directors.length" class="text-caption text-dim">{{ t('admin.noDirectors') }}</li>
    </ul>
  </section>
</template>
