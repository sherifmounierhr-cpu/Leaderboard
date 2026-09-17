<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData } from '@/composables/useAdminData'
import { useCelebrate } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import { useBoardMedia } from '@/composables/useBoardMedia'

const NOTE_MAX = 140

const { t, locale } = useI18n()
const localName = useLocalName()
const { agents } = useAdminData()
const { celebrate } = useCelebrate()
const { songs, settings, byId } = useBoardMedia()

/** 'default' = أغنية الإعدادات · 'none' = بدون صوت · غير كده = معرّف أغنية */
const songChoice = ref<string>('default')
/** null = مدة الإعدادات */
const customSeconds = ref<number | null>(null)

const defaultSongName = computed(() => byId.value.get(settings.value.celebration_song_id ?? '')?.name ?? null)

const agentId = ref('')
const note = ref('')
const sending = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)

const options = computed(() => {
  const collator = new Intl.Collator(locale.value)
  return agents.value
    .filter((a) => a.active)
    .map((a) => ({
      id: a.id,
      label: localName(a.name, a.name_ar),
      team: a.team_name ? localName(a.team_name, a.team_name_ar) : '',
    }))
    .sort((a, b) => collator.compare(a.label, b.label))
})

// تغيير الاختيار يمسح رسالة النتيجة السابقة حتى لا تُنسب للمستشار الجديد
watch(agentId, () => { message.value = null })

async function onSubmit() {
  if (!agentId.value || sending.value) return
  sending.value = true
  message.value = null
  try {
    await celebrate(agentId.value, note.value, {
      songId: songChoice.value === 'default' || songChoice.value === 'none' ? null : songChoice.value,
      mute: songChoice.value === 'none',
      seconds: customSeconds.value,
    })
    const name = options.value.find((o) => o.id === agentId.value)?.label ?? ''
    note.value = ''
    message.value = { ok: true, text: t('admin.celebrateDone', { name }) }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    sending.value = false
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <form
    class="flex w-full flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]"
    @submit.prevent="onSubmit"
  >
    <div class="flex items-start gap-3">
      <iconify-icon icon="mdi:party-popper" aria-hidden="true" class="mt-0.5 text-gold text-2xl" />
      <div class="flex flex-col gap-1">
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.celebrateTitle') }}</h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('admin.celebrateHint') }}</p>
      </div>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class="font-semibold text-caption text-mute">{{ t('table.agent') }}</span>
      <select v-model="agentId" required :class="FIELD">
        <option value="" disabled>{{ t('admin.celebratePick') }}</option>
        <option v-for="o in options" :key="o.id" :value="o.id">
          {{ o.team ? `${o.label} — ${o.team}` : o.label }}
        </option>
      </select>
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="flex items-center justify-between font-semibold text-caption text-mute">
        <span>{{ t('admin.celebrateNote') }}</span>
        <span class="tabular-nums text-dim">{{ note.length }}/{{ NOTE_MAX }}</span>
      </span>
      <input
        v-model="note"
        type="text"
        :maxlength="NOTE_MAX"
        :placeholder="t('admin.celebrateNotePlaceholder')"
        :class="FIELD"
      />
    </label>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('screen.celebrationSong') }}</span>
        <select v-model="songChoice" :class="FIELD">
          <option value="default">
            {{ defaultSongName ? t('screen.useDefaultSong', { name: defaultSongName }) : t('screen.useDefaultNone') }}
          </option>
          <option v-for="s in songs" :key="s.id" :value="s.id">{{ s.name }}</option>
          <option value="none">{{ t('screen.noSong') }}</option>
        </select>
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('screen.duration') }}</span>
        <select v-model="customSeconds" :class="FIELD">
          <option :value="null">{{ t('screen.useDefaultDuration', { n: settings.celebration_seconds }) }}</option>
          <option v-for="n in [5, 10, 15, 20, 30, 45, 60]" :key="n" :value="n">{{ t('screen.seconds', { n }) }}</option>
        </select>
      </label>
    </div>

    <p
      v-if="message"
      :role="message.ok ? 'status' : 'alert'"
      class="m-0 text-sm font-medium"
      :class="message.ok ? 'text-accent-text' : 'text-down'"
    >{{ message.text }}</p>

    <button
      type="submit"
      class="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      :disabled="!agentId || sending"
    >
      <iconify-icon icon="mdi:television-play" aria-hidden="true" class="text-lg" />
      {{ sending ? t('admin.celebrateSending') : t('admin.celebrateSend') }}
    </button>
  </form>
</template>
