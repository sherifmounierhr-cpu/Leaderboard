<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useOwners } from '@/composables/useOwners'
import { useAdminData } from '@/composables/useAdminData'
import { useScreenAdmin } from '@/composables/useScreenAdmin'
import { useLocalName } from '@/composables/useLocalName'
import { NUMBER_LOCALE, TIME_ZONE } from '@/lib/region'
import type { Owner, OwnerMessage } from '@/lib/types'
import ImageStudio from './ImageStudio.vue'
import VoiceRecorder, { type Voice } from './VoiceRecorder.vue'

/**
 * تبويب صاحب العمل: صورته واسمه، وكلمة مكتوبة أو صوتية بتظهر على كل
 * الشاشات — للكل، لفريق، أو لشخص بعينه.
 */
const props = defineProps<{ ownerSlot: 1 | 2 }>()

const { t, locale } = useI18n()
const localName = useLocalName()
const { owners, messages, reload, saveOwner, send, removeMessage, uploadVoice, preview } = useOwners()
const { agents, teams } = useAdminData()
const { uploadAnnouncementImage } = useScreenAdmin()

const BODY_MAX = 500

onMounted(() => void reload())

// ------------------------------------------------------------ البيانات الشخصية
const owner = computed(() => owners.value.find((o) => o.slot === props.ownerSlot) ?? null)
const profile = ref<Owner | null>(null)
watch(owner, (o) => { profile.value = o ? { ...o } : null }, { immediate: true })
const profileDirty = computed(() => {
  const a = profile.value
  const b = owner.value
  if (!a || !b) return false
  return (['name', 'name_ar', 'title', 'title_ar', 'photo_url'] as const).some((k) => (a[k] ?? '') !== (b[k] ?? ''))
})
const savingProfile = ref(false)
const profileMsg = ref<{ ok: boolean; text: string } | null>(null)

async function submitProfile() {
  if (!profile.value) return
  savingProfile.value = true
  profileMsg.value = null
  try {
    await saveOwner(profile.value)
    profileMsg.value = { ok: true, text: t('owners.profileSaved') }
  } catch (err) {
    profileMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    savingProfile.value = false
  }
}

const studio = ref<Blob | string | null>(null)
const uploadingPhoto = ref(false)
function pickPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) studio.value = file
}
async function onStudio(blob: Blob) {
  studio.value = null
  if (!profile.value) return
  uploadingPhoto.value = true
  profileMsg.value = null
  try {
    profile.value.photo_url = await uploadAnnouncementImage(blob, 'image', true)
    // الصورة لوحدها تتحفظ على طول — ما يستناش زرار الحفظ
    await saveOwner(profile.value)
    profileMsg.value = { ok: true, text: t('owners.photoSaved') }
  } catch (err) {
    profileMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    uploadingPhoto.value = false
  }
}

const displayName = computed(() => {
  const p = profile.value
  return p ? localName(p.name, p.name_ar) || t(`owners.tab${props.ownerSlot}`) : ''
})
const initials = computed(() => displayName.value.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join(''))

// ------------------------------------------------------------ الكلمة
type Target = 'all' | 'team' | 'agent'
const target = ref<Target>('all')
const toTeam = ref<string>('')
const toAgent = ref<string>('')
const body = ref('')
const voice = ref<Voice | null>(null)
const sending = ref(false)
const sendMsg = ref<{ ok: boolean; text: string } | null>(null)

const collator = computed(() => new Intl.Collator(locale.value))
const teamOptions = computed(() =>
  teams.value.filter((x) => x.active).map((x) => ({ id: x.id, label: localName(x.name, x.name_ar), photo: x.photo_url }))
    .sort((a, b) => collator.value.compare(a.label, b.label)),
)
/** الأشخاص متجمّعين بفرقهم — أسهل تلاقي حد في قائمة طويلة. */
const agentGroups = computed(() => {
  const groups = new Map<string, { label: string; people: Array<{ id: string; label: string }> }>()
  for (const a of agents.value.filter((x) => x.active)) {
    const key = a.team_id ?? ''
    const label = a.team_name ? localName(a.team_name, a.team_name_ar) : t('owners.noTeam')
    if (!groups.has(key)) groups.set(key, { label, people: [] })
    groups.get(key)!.people.push({ id: a.id, label: localName(a.name, a.name_ar) })
  }
  return [...groups.values()]
    .map((g) => ({ ...g, people: g.people.sort((x, y) => collator.value.compare(x.label, y.label)) }))
    .sort((a, b) => collator.value.compare(a.label, b.label))
})

const pickedAgent = computed(() => agents.value.find((a) => a.id === toAgent.value) ?? null)
const pickedTeam = computed(() => teams.value.find((x) => x.id === toTeam.value) ?? null)

const ready = computed(() =>
  (body.value.trim().length > 0 || voice.value !== null)
  && (target.value !== 'team' || !!toTeam.value)
  && (target.value !== 'agent' || !!toAgent.value),
)

/** الرسالة بشكل العرض — للمعاينة على الجهاز ده بس. */
function draftMessage(audioUrl: string | null): OwnerMessage {
  const p = profile.value
  const a = target.value === 'agent' ? pickedAgent.value : null
  const team = target.value === 'team' ? pickedTeam.value : null
  return {
    id: 'preview', slot: props.ownerSlot, body: body.value.trim() || null,
    audio_url: audioUrl, audio_seconds: voice.value?.seconds ?? null, created_at: new Date().toISOString(),
    owner_name: p?.name ?? '', owner_name_ar: p?.name_ar ?? null, owner_title: p?.title ?? null, owner_title_ar: p?.title_ar ?? null,
    owner_photo: p?.photo_url ?? null,
    to_agent_id: a?.id ?? null, to_agent_name: a?.name ?? null, to_agent_name_ar: a?.name_ar ?? null, to_agent_photo: a?.photo_url ?? null,
    to_team_id: team?.id ?? null, to_team_name: team?.name ?? null, to_team_name_ar: team?.name_ar ?? null, to_team_photo: team?.photo_url ?? null,
  }
}

let previewUrl: string | null = null
function previewDraft() {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
  previewUrl = voice.value ? URL.createObjectURL(voice.value.blob) : null
  preview(draftMessage(previewUrl))
}

async function submit() {
  if (!ready.value) return
  sending.value = true
  sendMsg.value = null
  try {
    const audioUrl = voice.value ? await uploadVoice(voice.value.blob) : null
    await send({
      slot: props.ownerSlot,
      body: body.value,
      audioUrl,
      audioSeconds: voice.value?.seconds ?? null,
      toAgent: target.value === 'agent' ? toAgent.value : null,
      toTeam: target.value === 'team' ? toTeam.value : null,
    })
    sendMsg.value = { ok: true, text: t('owners.sent') }
    body.value = ''
    voice.value = null
  } catch (err) {
    sendMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    sending.value = false
  }
}

// ------------------------------------------------------------ السجل
const history = computed(() => messages.value.filter((m) => m.slot === props.ownerSlot).slice(0, 20))

function when(iso: string) {
  return new Intl.DateTimeFormat(locale.value === 'ar' ? NUMBER_LOCALE.ar : 'en-GB', {
    timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}
function audienceOf(m: OwnerMessage) {
  if (m.to_agent_id && m.to_agent_name) return localName(m.to_agent_name, m.to_agent_name_ar)
  if (m.to_team_id && m.to_team_name) return t('owners.toTeam', { name: localName(m.to_team_name, m.to_team_name_ar) })
  return t('owners.toAll')
}

async function resend(m: OwnerMessage) {
  sendMsg.value = null
  try {
    await send({
      slot: props.ownerSlot, body: m.body ?? '', audioUrl: m.audio_url, audioSeconds: m.audio_seconds,
      toAgent: m.to_agent_id, toTeam: m.to_team_id,
    })
    sendMsg.value = { ok: true, text: t('owners.sent') }
  } catch (err) {
    sendMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

async function remove(m: OwnerMessage) {
  if (!confirm(t('owners.confirmDelete'))) return
  try {
    await removeMessage(m.id)
  } catch (err) {
    sendMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-5">
    <!-- رأس التبويب بهوية صاحبه -->
    <header class="owner-hero relative flex flex-wrap items-center gap-5 overflow-hidden rounded-2xl px-5 py-5 text-white sm:px-7">
      <span class="peaks !opacity-[0.08]" aria-hidden="true" />
      <div class="relative">
        <div class="owner-ring flex size-24 items-center justify-center overflow-hidden rounded-full bg-[#0f4e49] sm:size-28">
          <img v-if="profile?.photo_url" :src="profile.photo_url" alt="" class="size-full object-cover object-[center_20%]" />
          <span v-else class="text-3xl font-extrabold text-[#f0d38a]" aria-hidden="true">{{ initials }}</span>
        </div>
        <label
          class="absolute -bottom-1 -end-1 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-[#f0d38a] text-[#0a2627] shadow-lg transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-white"
          :title="t('owners.changePhoto')"
        >
          <iconify-icon :icon="uploadingPhoto ? 'mdi:loading' : 'mdi:camera'" :class="uploadingPhoto ? 'animate-spin' : ''" aria-hidden="true" class="text-xl" />
          <span class="sr-only">{{ t('owners.changePhoto') }}</span>
          <input type="file" accept="image/*" class="sr-only" :disabled="uploadingPhoto" @change="pickPhoto" />
        </label>
      </div>
      <div class="relative min-w-0 flex-1">
        <p class="m-0 text-caption font-semibold text-[#f0d38a]">{{ t(`owners.tab${ownerSlot}`) }}</p>
        <h2 dir="auto" class="m-0 truncate text-2xl font-extrabold">{{ displayName }}</h2>
        <p class="m-0 mt-1 text-sm text-white/75">{{ t('owners.hint') }}</p>
      </div>
    </header>

    <div class="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <!-- الكلمة -->
      <form class="admin-form flex flex-col gap-5 rounded-xl border border-card-border bg-card p-5 shadow-[var(--shadow-card)]" @submit.prevent="submit">
        <h3 class="admin-card-title flex items-center gap-2">
          <iconify-icon icon="mdi:bullhorn-outline" aria-hidden="true" class="text-gold-text" />
          {{ t('owners.compose') }}
        </h3>

        <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
          <legend class="mb-1.5 font-semibold text-caption text-mute">{{ t('owners.toField') }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="tg in (['all', 'team', 'agent'] as const)"
              :key="tg"
              type="button"
              class="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold transition-colors"
              :class="target === tg ? 'border-accent bg-accent/10 text-accent-text' : 'border-card-border text-mute hover:text-strong'"
              :aria-pressed="target === tg"
              @click="target = tg"
            >
              <iconify-icon :icon="tg === 'all' ? 'mdi:account-group' : tg === 'team' ? 'mdi:shield-account-outline' : 'mdi:account-star-outline'" aria-hidden="true" class="text-lg" />
              {{ t(`owners.target_${tg}`) }}
            </button>
          </div>
          <select v-if="target === 'team'" v-model="toTeam" :class="FIELD" :aria-label="t('owners.pickTeam')">
            <option value="" disabled>{{ t('owners.pickTeam') }}</option>
            <option v-for="o in teamOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
          <select v-if="target === 'agent'" v-model="toAgent" :class="FIELD" :aria-label="t('owners.pickPerson')">
            <option value="" disabled>{{ t('owners.pickPerson') }}</option>
            <optgroup v-for="g in agentGroups" :key="g.label" :label="g.label">
              <option v-for="p in g.people" :key="p.id" :value="p.id">{{ p.label }}</option>
            </optgroup>
          </select>
        </fieldset>

        <label class="flex flex-col gap-1.5">
          <span class="flex justify-between font-semibold text-caption text-mute">
            <span>{{ t('owners.bodyField') }}</span>
            <span class="tabular-nums text-dim">{{ body.length }}/{{ BODY_MAX }}</span>
          </span>
          <textarea v-model="body" :maxlength="BODY_MAX" rows="4" dir="auto" :class="FIELD" :placeholder="t('owners.bodyPlaceholder')" />
        </label>

        <div class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('owners.voiceField') }}</span>
          <VoiceRecorder v-model="voice" />
        </div>

        <p v-if="sendMsg" :role="sendMsg.ok ? 'status' : 'alert'" class="m-0 text-sm font-medium" :class="sendMsg.ok ? 'text-accent-text' : 'text-down'">{{ sendMsg.text }}</p>

        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-bold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
            :disabled="!ready || sending"
          >
            <iconify-icon :icon="sending ? 'mdi:loading' : 'mdi:television-play'" :class="sending ? 'animate-spin' : ''" aria-hidden="true" class="text-lg" />
            {{ sending ? t('owners.sending') : t('owners.send') }}
          </button>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-card-border px-4 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
            :disabled="!ready"
            @click="previewDraft"
          >
            <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="text-lg" />
            {{ t('messages.preview') }}
          </button>
        </div>
      </form>

      <div class="flex flex-col gap-5">
        <!-- البيانات -->
        <form v-if="profile" class="admin-form flex flex-col gap-3 rounded-xl border border-card-border bg-card p-5 shadow-[var(--shadow-card)]" @submit.prevent="submitProfile">
          <h3 class="admin-card-title flex items-center gap-2">
            <iconify-icon icon="mdi:card-account-details-outline" aria-hidden="true" class="text-accent-text" />
            {{ t('owners.profile') }}
          </h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="font-semibold text-caption text-mute">{{ t('owners.nameAr') }}</span>
              <input v-model="profile.name_ar" maxlength="60" dir="rtl" :class="FIELD" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="font-semibold text-caption text-mute">{{ t('owners.nameEn') }}</span>
              <input v-model="profile.name" maxlength="60" dir="ltr" :class="FIELD" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="font-semibold text-caption text-mute">{{ t('owners.titleAr') }}</span>
              <input v-model="profile.title_ar" maxlength="60" dir="rtl" :class="FIELD" :placeholder="t('owners.titlePlaceholderAr')" />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="font-semibold text-caption text-mute">{{ t('owners.titleEn') }}</span>
              <input v-model="profile.title" maxlength="60" dir="ltr" :class="FIELD" placeholder="Chairman" />
            </label>
          </div>
          <p v-if="profileMsg" :role="profileMsg.ok ? 'status' : 'alert'" class="m-0 text-sm" :class="profileMsg.ok ? 'text-accent-text' : 'text-down'">{{ profileMsg.text }}</p>
          <button
            type="submit"
            class="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-accent/50 px-4 text-sm font-bold text-accent-text transition-colors hover:bg-accent/10 disabled:opacity-50"
            :disabled="!profileDirty || savingProfile"
          >{{ savingProfile ? t('admin.saving') : t('owners.saveProfile') }}</button>
        </form>

        <!-- السجل -->
        <div class="flex flex-col gap-2 rounded-xl border border-card-border bg-card p-5 shadow-[var(--shadow-card)]">
          <h3 class="admin-card-title flex items-center gap-2">
            <iconify-icon icon="mdi:history" aria-hidden="true" class="text-mute" />
            {{ t('owners.history') }}
          </h3>
          <p v-if="!history.length" class="admin-empty m-0">{{ t('owners.empty') }}</p>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="m in history" :key="m.id" class="flex items-start gap-3 rounded-lg border border-card-border px-3 py-2.5">
              <span class="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full" :class="m.audio_url ? 'bg-accent/12 text-accent-text' : 'bg-gold/15 text-gold-text'" aria-hidden="true">
                <iconify-icon :icon="m.audio_url ? 'mdi:microphone' : 'mdi:message-text-outline'" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="m-0 text-caption font-bold text-strong"><bdi>{{ audienceOf(m) }}</bdi></p>
                <p v-if="m.body" dir="auto" class="m-0 line-clamp-2 text-sm text-mute">{{ m.body }}</p>
                <p class="m-0 text-caption text-dim">{{ when(m.created_at) }}<template v-if="m.audio_seconds"> · 🎙 {{ Math.round(m.audio_seconds) }}s</template></p>
              </div>
              <div class="flex shrink-0 items-center">
                <button type="button" class="inline-flex size-11 items-center justify-center rounded-lg text-mute hover:text-strong" :aria-label="t('messages.preview')" @click="preview(m)">
                  <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="text-lg" />
                </button>
                <button type="button" class="inline-flex size-11 items-center justify-center rounded-lg text-mute hover:text-accent-text" :aria-label="t('owners.resend')" :title="t('owners.resend')" @click="resend(m)">
                  <iconify-icon icon="mdi:send" aria-hidden="true" class="text-lg" />
                </button>
                <button type="button" class="inline-flex size-11 items-center justify-center rounded-lg text-mute hover:text-down" :aria-label="t('admin.delete')" @click="remove(m)">
                  <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" class="text-lg" />
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <ImageStudio
      v-if="studio"
      :source="studio"
      :name="displayName"
      purpose="person"
      :max-edge="1200"
      @confirm="onStudio"
      @cancel="studio = null"
    />
  </section>
</template>

<style scoped>
.owner-hero {
  background:
    radial-gradient(60% 120% at 0% 0%, #0f7e7666, transparent 70%),
    linear-gradient(120deg, var(--color-header), #071c1d);
}
.owner-ring {
  box-shadow: 0 0 0 3px #f0d38a, 0 0 0 8px #f0d38a26;
}
</style>
