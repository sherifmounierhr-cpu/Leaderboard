<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScreenAdmin } from '@/composables/useScreenAdmin'
import { useAudioPlayer } from '@/composables/useAudioPlayer'

/** مدة الاحتفال، الأغنية الافتراضية، ومستوى الصوت لكل الشاشات. */
const { t } = useI18n()
const { settings, songs, urlOf, saveSettings, saveCelebrationLang, saveHideAgentSales } = useScreenAdmin()
const { play, stop, playing } = useAudioPlayer()

const seconds = ref(settings.value.celebration_seconds)
const songId = ref<string | null>(settings.value.celebration_song_id)
const volume = ref(settings.value.volume)
const lang = ref<'auto' | 'ar' | 'en'>(settings.value.celebration_lang ?? 'auto')
const saving = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)

// الإعدادات بتوصل بعد التحميل (أو تتغير من جهاز تاني): النموذج يتبعها لو ما اتعدلش
watch(settings, (s) => {
  if (dirty.value) return
  seconds.value = s.celebration_seconds
  songId.value = s.celebration_song_id
  volume.value = s.volume
  lang.value = s.celebration_lang ?? 'auto'
})

const dirty = computed(
  () =>
    seconds.value !== settings.value.celebration_seconds ||
    songId.value !== settings.value.celebration_song_id ||
    volume.value !== settings.value.volume ||
    lang.value !== (settings.value.celebration_lang ?? 'auto'),
)

async function onSave() {
  saving.value = true
  message.value = null
  try {
    if (lang.value !== (settings.value.celebration_lang ?? 'auto')) await saveCelebrationLang(lang.value)
    await saveSettings(seconds.value, songId.value, volume.value)
    message.value = { ok: true, text: t('screen.settingsSaved') }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    saving.value = false
  }
}

/** إخفاء مبالغ الأفراد: بيتطبّق فوراً على كل الشاشات من غير زرار حفظ. */
const hideBusy = ref(false)
async function onHideSales(event: Event) {
  const hide = (event.target as HTMLInputElement).checked
  hideBusy.value = true
  message.value = null
  try {
    await saveHideAgentSales(hide)
    message.value = { ok: true, text: t('screen.settingsSaved') }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    hideBusy.value = false
  }
}

function onTry() {
  if (playing.value) return stop()
  const url = urlOf(songId.value)
  if (url) void play(url, volume.value, seconds.value)
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]">
    <div class="flex items-start gap-3">
      <iconify-icon icon="mdi:tune-variant" aria-hidden="true" class="mt-0.5 text-accent-text text-2xl" />
      <div class="flex flex-col gap-1">
        <h2 class="admin-card-title">{{ t('screen.settingsTitle') }}</h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('screen.settingsHint') }}</p>
      </div>
    </div>

    <label class="flex flex-col gap-2">
      <span class="flex items-center justify-between font-semibold text-caption text-mute">
        <span>{{ t('screen.duration') }}</span>
        <b class="tabular-nums text-strong text-sm">{{ t('screen.seconds', { n: seconds }) }}</b>
      </span>
      <input v-model.number="seconds" type="range" min="3" max="60" step="1" class="w-full accent-[var(--color-accent)]" />
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="font-semibold text-caption text-mute">{{ t('screen.defaultSong') }}</span>
      <select v-model="songId" :class="FIELD">
        <option :value="null">{{ t('screen.noSong') }}</option>
        <option v-for="s in songs" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <span v-if="!songs.length" class="text-caption text-dim">{{ t('screen.noSongsYet') }}</span>
    </label>

    <label class="flex flex-col gap-2">
      <span class="flex items-center justify-between font-semibold text-caption text-mute">
        <span>{{ t('screen.volume') }}</span>
        <b class="tabular-nums text-strong text-sm">{{ volume }}%</b>
      </span>
      <input v-model.number="volume" type="range" min="0" max="100" step="5" class="w-full accent-[var(--color-accent)]" />
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="font-semibold text-caption text-mute">{{ t('screen.celebrationLang') }}</span>
      <select v-model="lang" :class="FIELD">
        <option value="auto">{{ t('screen.langAuto') }}</option>
        <option value="ar">العربية</option>
        <option value="en">English</option>
      </select>
      <span class="text-caption text-dim">{{ t('screen.celebrationLangHint') }}</span>
    </label>

    <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-card-border bg-page px-4 py-3">
      <input
        type="checkbox"
        class="mt-1 size-4 accent-[var(--color-accent)]"
        :checked="settings.hide_agent_sales === true"
        :disabled="hideBusy"
        @change="onHideSales"
      />
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-semibold text-strong">{{ t('screen.hideAgentSales') }}</span>
        <span class="text-caption text-mute leading-snug">{{ t('screen.hideAgentSalesHint') }}</span>
      </span>
    </label>

    <p
      v-if="message"
      :role="message.ok ? 'status' : 'alert'"
      class="m-0 text-sm font-medium"
      :class="message.ok ? 'text-accent-text' : 'text-down'"
    >{{ message.text }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        :disabled="saving || !dirty"
        @click="onSave"
      >
        <iconify-icon icon="mdi:content-save-outline" aria-hidden="true" class="text-lg" />
        {{ saving ? t('admin.saving') : t('admin.save') }}
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-lg border border-card-border px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
        :disabled="!songId"
        @click="onTry"
      >
        <iconify-icon :icon="playing ? 'mdi:stop' : 'mdi:play'" aria-hidden="true" class="text-lg" />
        {{ playing ? t('screen.stop') : t('screen.trySong') }}
      </button>
    </div>
  </section>
</template>
