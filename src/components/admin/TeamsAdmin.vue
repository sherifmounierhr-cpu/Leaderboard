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
  manager_ids: string[]
  supervisor_ids: string[]
}

type Role = 'manager' | 'supervisor'
const ROLES: Role[] = ['manager', 'supervisor']
const idsKey = (role: Role): 'manager_ids' | 'supervisor_ids' =>
  role === 'manager' ? 'manager_ids' : 'supervisor_ids'

const editing = ref<Draft | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

function blank(): Draft {
  return { id: null, name: '', name_ar: '', photo_url: null, active: true, manager_ids: [], supervisor_ids: [] }
}

function edit(team: AdminTeam) {
  formError.value = null
  editing.value = {
    id: team.id,
    name: team.name,
    name_ar: team.name_ar ?? '',
    photo_url: team.photo_url,
    active: team.active,
    manager_ids: [...(team.manager_ids ?? [])],
    supervisor_ids: [...(team.supervisor_ids ?? [])],
  }
}

const agentLabel = (id: string) => {
  const a = agents.value.find((x) => x.id === id)
  if (!a) return ''
  const name = localName(a.name, a.name_ar)
  return a.active ? name : `${name} (${t('admin.inactive')})`
}

/**
 * مستشارو الفريق أولاً — الغالب أن القيادة منهم — ثم بقية الفرق. من اختير
 * بأي دور في هذا الفريق يختفي من القائمتين: الشخص بدور واحد داخل الفريق.
 */
const leadOptions = computed(() => {
  const draft = editing.value
  const collator = new Intl.Collator(locale.value)
  const taken = new Set([...(draft?.manager_ids ?? []), ...(draft?.supervisor_ids ?? [])])
  const available = agents.value
    .filter((a) => !taken.has(a.id))
    .map((a) => ({ id: a.id, label: agentLabel(a.id), own: Boolean(draft?.id && a.team_id === draft.id) }))
    .sort((x, y) => collator.compare(x.label, y.label))
  return { own: available.filter((o) => o.own), other: available.filter((o) => !o.own) }
})

function addLead(role: Role, event: Event) {
  const select = event.target as HTMLSelectElement
  if (editing.value && select.value) editing.value[idsKey(role)].push(select.value)
  select.value = ''
}

function removeLead(role: Role, id: string) {
  if (!editing.value) return
  const key = idsKey(role)
  editing.value[key] = editing.value[key].filter((x) => x !== id)
}

const agentName = (id: string) => {
  const a = agents.value.find((x) => x.id === id)
  return a ? localName(a.name, a.name_ar) : ''
}

async function submit() {
  if (!editing.value) return
  const { manager_ids, supervisor_ids } = editing.value
  if (manager_ids.some((id) => supervisor_ids.includes(id))) {
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
      manager_ids,
      supervisor_ids,
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
        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="role in ROLES" :key="role" class="flex flex-col gap-2">
            <span class="font-semibold text-caption text-mute">{{ t(`admin.${role}s`) }}</span>

            <!-- المختارون كرقاقات قابلة للإزالة، بترتيب إضافتهم -->
            <ul class="m-0 p-0 list-none flex flex-wrap gap-1.5 min-h-8 items-center">
              <li
                v-for="id in editing[idsKey(role)]"
                :key="id"
                class="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 ps-3 pe-1 py-1 text-caption font-semibold text-strong"
              >
                {{ agentLabel(id) }}
                <button
                  type="button"
                  class="inline-flex size-6 items-center justify-center rounded-full text-mute transition-colors hover:bg-down/10 hover:text-down"
                  :aria-label="t('admin.removeLead', { name: agentLabel(id) })"
                  @click="removeLead(role, id)"
                >
                  <iconify-icon icon="mdi:close" aria-hidden="true" />
                </button>
              </li>
              <li v-if="!editing[idsKey(role)].length" class="text-caption text-dim">{{ t('admin.noLeads') }}</li>
            </ul>

            <select :class="FIELD" :aria-label="`${t('admin.addLead')} ${t(`admin.${role}`)}`" @change="addLead(role, $event)">
              <option value="">{{ t('admin.addLead') }}</option>
              <optgroup v-if="leadOptions.own.length" :label="editing.name_ar || editing.name">
                <option v-for="o in leadOptions.own" :key="o.id" :value="o.id">{{ o.label }}</option>
              </optgroup>
              <optgroup :label="leadOptions.own.length ? t('admin.otherTeams') : t('admin.agents')">
                <option v-for="o in leadOptions.other" :key="o.id" :value="o.id">{{ o.label }}</option>
              </optgroup>
            </select>
          </div>
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
          <p v-if="team.manager_ids.length || team.supervisor_ids.length" class="m-0 mt-0.5 text-caption text-mute truncate">
            <template v-if="team.manager_ids.length">
              {{ t(team.manager_ids.length > 1 ? 'admin.managers' : 'admin.manager') }}:
              <b class="font-semibold text-strong">{{ team.manager_ids.map(agentName).join('، ') }}</b>
            </template>
            <template v-if="team.manager_ids.length && team.supervisor_ids.length"> · </template>
            <template v-if="team.supervisor_ids.length">
              {{ t(team.supervisor_ids.length > 1 ? 'admin.supervisors' : 'admin.supervisor') }}:
              <b class="font-semibold text-strong">{{ team.supervisor_ids.map(agentName).join('، ') }}</b>
            </template>
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
