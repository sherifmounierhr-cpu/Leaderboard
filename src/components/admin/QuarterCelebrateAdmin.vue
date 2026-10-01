<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBoardData } from '@/composables/useBoardData'
import { useBoardMedia } from '@/composables/useBoardMedia'
import { useCelebrate, type QuarterCelebrationCounts } from '@/composables/useSaleEvents'

const NOTE_MAX = 140
const INTRO_MAX = 280

const { t } = useI18n()
const { year: boardYear, quarter: boardQuarter } = useBoardData()
const { songs } = useBoardMedia()
const { celebrateQuarter } = useCelebrate()

const year = ref(boardYear.value)
const quarter = ref(boardQuarter.value)
const introMessage = ref(t('admin.quarterCelebrateIntroDefault'))
const introSongId = ref<string | null>(null)
const teamNote = ref(t('admin.quarterCelebrateTeamNoteDefault'))
const agentNote = ref(t('admin.quarterCelebrateAgentNoteDefault'))
const sending = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)
const confirmed = ref(false)

async function onSubmit() {
  if (sending.value) return
  if (!confirmed.value) {
    confirmed.value = true
    return
  }
  sending.value = true
  message.value = null
  try {
    const counts: QuarterCelebrationCounts = await celebrateQuarter(
      year.value,
      quarter.value,
      teamNote.value,
      agentNote.value,
      introMessage.value,
      introSongId.value,
    )
    message.value = {
      ok: true,
      text: t('admin.quarterCelebrateDone', { teams: counts.teams, agents: counts.agents }),
    }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    sending.value = false
    confirmed.value = false
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
      <iconify-icon icon="mdi:trophy-award" aria-hidden="true" class="mt-0.5 text-gold text-2xl" />
      <div class="flex flex-col gap-1">
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.quarterCelebrateTitle') }}</h2>
        <p class="m-0 text-mute text-sm leading-relaxed">{{ t('admin.quarterCelebrateHint') }}</p>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('admin.quarterCelebrateYear') }}</span>
        <input v-model.number="year" type="number" min="2020" max="2100" required :class="FIELD" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('quarter.label') }}</span>
        <select v-model.number="quarter" required :class="FIELD">
          <option v-for="q in [1, 2, 3, 4]" :key="q" :value="q">{{ t('quarter.short', { n: q }) }}</option>
        </select>
      </label>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-card-border p-3 lg:p-4">
      <p class="m-0 font-semibold text-strong text-sm">{{ t('admin.quarterCelebrateIntroTitle') }}</p>
      <p class="m-0 text-caption text-mute">{{ t('admin.quarterCelebrateIntroHint') }}</p>

      <label class="flex flex-col gap-1.5">
        <span class="flex items-center justify-between font-semibold text-caption text-mute">
          <span>{{ t('admin.quarterCelebrateIntroMessage') }}</span>
          <span class="tabular-nums text-dim">{{ introMessage.length }}/{{ INTRO_MAX }}</span>
        </span>
        <textarea v-model="introMessage" rows="3" :maxlength="INTRO_MAX" :class="FIELD" />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('screen.celebrationSong') }}</span>
        <select v-model="introSongId" :class="FIELD">
          <option :value="null">{{ t('screen.noSong') }}</option>
          <option v-for="s in songs" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class="flex items-center justify-between font-semibold text-caption text-mute">
        <span>{{ t('admin.quarterCelebrateTeamNote') }}</span>
        <span class="tabular-nums text-dim">{{ teamNote.length }}/{{ NOTE_MAX }}</span>
      </span>
      <input v-model="teamNote" type="text" :maxlength="NOTE_MAX" :class="FIELD" />
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="flex items-center justify-between font-semibold text-caption text-mute">
        <span>{{ t('admin.quarterCelebrateAgentNote') }}</span>
        <span class="tabular-nums text-dim">{{ agentNote.length }}/{{ NOTE_MAX }}</span>
      </span>
      <input v-model="agentNote" type="text" :maxlength="NOTE_MAX" :class="FIELD" />
    </label>

    <p
      v-if="message"
      :role="message.ok ? 'status' : 'alert'"
      class="m-0 text-sm font-medium"
      :class="message.ok ? 'text-accent-text' : 'text-down'"
    >{{ message.text }}</p>

    <p v-if="confirmed && !sending" role="alert" class="m-0 text-down text-sm font-medium">
      {{ t('admin.quarterCelebrateConfirm') }}
    </p>

    <button
      type="submit"
      class="inline-flex items-center justify-center gap-2 self-start rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
      :class="confirmed ? 'bg-down hover:opacity-90' : 'bg-accent hover:bg-accent-strong'"
      :disabled="sending"
    >
      <iconify-icon icon="mdi:television-play" aria-hidden="true" class="text-lg" />
      {{ sending ? t('admin.celebrateSending') : confirmed ? t('admin.quarterCelebrateConfirmSend') : t('admin.quarterCelebrateSend') }}
    </button>
  </form>
</template>
