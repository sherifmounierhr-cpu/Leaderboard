<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData, type AdminTeam } from '@/composables/useAdminData'
import { useLocalName } from '@/composables/useLocalName'
import PhotoField from './PhotoField.vue'

const { teams, agents, saveTeam, deleteTeam } = useAdminData()
const { t, locale } = useI18n()
const localName = useLocalName()

type Draft = {
  id: string | null
  name: string
  name_ar: string
  photo_url: string | null
  active: boolean
  manager_agent_id: string
  supervisor_agent_id: string
}

const editing = ref<Draft | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

function blank(): Draft {
  return { id: null, name: '', name_ar: '', photo_url: null, active: true, manager_agent_id: '', supervisor_agent_id: '' }
}

function edit(team: AdminTeam) {
  formError.value = null
  editing.value = {
    id: team.id,
    name: team.name,
    name_ar: team.name_ar ?? '',
    photo_url: team.photo_url,
    active: team.active,
    manager_agent_id: team.manager_agent_id ?? '',
    supervisor_agent_id: team.supervisor_agent_id ?? '',
  }
}

/** مستشارو الفريق أولاً — الغالب أن المدير منهم — ثم بقية الفرق. */
const leadOptions = computed(() => {
  const collator = new Intl.Collator(locale.value)
  const teamId = editing.value?.id
  const toOption = (a: (typeof agents.value)[number]) => ({
    id: a.id,
    label: a.active ? localName(a.name, a.name_ar) : `${localName(a.name, a.name_ar)} (${t('admin.inactive')})`,
  })
  const sort = (x: { label: string }, y: { label: string }) => collator.compare(x.label, y.label)
  return {
    own: agents.value.filter((a) => teamId && a.team_id === teamId).map(toOption).sort(sort),
    other: agents.value.filter((a) => !teamId || a.team_id !== teamId).map(toOption).sort(sort),
  }
})

const agentName = (id: string | null) => {
  const a = id ? agents.value.find((x) => x.id === id) : null
  return a ? localName(a.name, a.name_ar) : ''
}

async function submit() {
  if (!editing.value) return
  const { manager_agent_id: manager, supervisor_agent_id: supervisor } = editing.value
  if (manager && manager === supervisor) {
    formError.value = t('admin.leadsSame')
    return
  }
  saving.value = true
  formError.value = null
  try {
    await saveTeam({
      id: editing.value.id ?? undefined,
      name: editing.value.name,
      name_ar: editing.value.name_ar || null,
      photo_url: editing.value.photo_url,
      active: editing.value.active,
      manager_agent_id: manager || null,
      supervisor_agent_id: supervisor || null,
    })
    editing.value = null
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function remove(team: AdminTeam) {
  if (!confirm(t('admin.confirmDeleteTeam', { name: team.name }))) return
  try {
    await deleteTeam(team.id)
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex items-center justify-between gap-3">
      <h2 class="m-0 font-semibold text-strong text-lg">
        {{ t('admin.teams') }}
        <span class="font-medium text-mute text-sm">({{ teams.length }})</span>
      </h2>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
        @click="editing = blank(); formError = null"
      >
        <iconify-icon icon="mdi:plus" aria-hidden="true" />
        {{ t('admin.addTeam') }}
      </button>
    </header>

    <!-- نموذج التحرير -->
    <form
      v-if="editing"
      class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-card p-4 lg:p-5 shadow-[var(--shadow-card)]"
      @submit.prevent="submit"
    >
      <PhotoField
        v-model="editing.photo_url"
        kind="team"
        :record-id="editing.id"
        :name="editing.name || '؟'"
      />

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameEn') }} *</span>
          <input v-model="editing.name" :class="FIELD" required :placeholder="'New Capital'" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameAr') }}</span>
          <input v-model="editing.name_ar" :class="FIELD" placeholder="العاصمة الإدارية" />
        </label>
      </div>

      <fieldset class="m-0 flex flex-col gap-3 rounded-lg border border-card-border p-3 lg:p-4">
        <legend class="px-1 font-semibold text-strong text-sm">{{ t('admin.leads') }}</legend>
        <p class="m-0 text-caption text-mute">{{ t('admin.leadsHint') }}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label
            v-for="field in (['manager_agent_id', 'supervisor_agent_id'] as const)"
            :key="field"
            class="flex flex-col gap-1.5"
          >
            <span class="font-semibold text-caption text-mute">
              {{ field === 'manager_agent_id' ? t('admin.manager') : t('admin.supervisor') }}
            </span>
            <select v-model="editing[field]" :class="FIELD">
              <option value="">{{ t('admin.noLead') }}</option>
              <optgroup v-if="leadOptions.own.length" :label="editing.name_ar || editing.name">
                <option v-for="o in leadOptions.own" :key="o.id" :value="o.id">{{ o.label }}</option>
              </optgroup>
              <optgroup :label="leadOptions.own.length ? t('admin.otherTeams') : t('admin.agents')">
                <option v-for="o in leadOptions.other" :key="o.id" :value="o.id">{{ o.label }}</option>
              </optgroup>
            </select>
          </label>
        </div>
      </fieldset>

      <label class="flex items-center gap-2.5 text-sm font-semibold text-strong">
        <input v-model="editing.active" type="checkbox" class="size-5 accent-[var(--color-accent)]" />
        {{ t('admin.active') }}
        <span class="font-medium text-caption text-mute">— {{ t('admin.activeHint') }}</span>
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

    <!-- القائمة -->
    <ul class="m-0 p-0 list-none flex flex-col gap-2">
      <li
        v-for="team in teams"
        :key="team.id"
        class="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
        :class="team.active ? '' : 'opacity-60'"
      >
        <span
          class="size-11 shrink-0 overflow-hidden rounded-lg bg-avatar bg-cover bg-center outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center font-bold text-avatar-text text-caption"
          :style="team.photo_url ? { backgroundImage: `url('${team.photo_url}')` } : undefined"
        >{{ team.photo_url ? '' : team.name.slice(0, 2).toUpperCase() }}</span>

        <div class="min-w-0 flex-1">
          <p class="m-0 font-semibold text-strong truncate">{{ team.name_ar || team.name }}</p>
          <p class="m-0 text-caption text-mute truncate">
            {{ team.name }}<template v-if="!team.active"> · {{ t('admin.inactive') }}</template>
          </p>
          <p v-if="team.manager_agent_id || team.supervisor_agent_id" class="m-0 mt-0.5 text-caption text-mute truncate">
            <template v-if="team.manager_agent_id">{{ t('admin.manager') }}: <b class="font-semibold text-strong">{{ agentName(team.manager_agent_id) }}</b></template>
            <template v-if="team.manager_agent_id && team.supervisor_agent_id"> · </template>
            <template v-if="team.supervisor_agent_id">{{ t('admin.supervisor') }}: <b class="font-semibold text-strong">{{ agentName(team.supervisor_agent_id) }}</b></template>
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
          @click="edit(team)"
        >{{ t('admin.edit') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          :aria-label="t('admin.delete')"
          @click="remove(team)"
        >
          <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>
