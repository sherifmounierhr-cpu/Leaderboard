<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAdminData, type AdminAgent } from '@/composables/useAdminData'
import { useLocalName } from '@/composables/useLocalName'
import PhotoField from './PhotoField.vue'

const { agents, teams, saveAgent, deleteAgent } = useAdminData()
const { t } = useI18n()
const localName = useLocalName()

type Draft = {
  id: string | null
  name: string
  name_ar: string
  team_id: string | null
  photo_url: string | null
  active: boolean
}

const editing = ref<Draft | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return agents.value
  return agents.value.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      (a.name_ar ?? '').toLowerCase().includes(q) ||
      (a.team_name ?? '').toLowerCase().includes(q) ||
      (a.team_name_ar ?? '').toLowerCase().includes(q),
  )
})

function blank(): Draft {
  return { id: null, name: '', name_ar: '', team_id: null, photo_url: null, active: true }
}

function edit(agent: AdminAgent) {
  formError.value = null
  editing.value = {
    id: agent.id,
    name: agent.name,
    name_ar: agent.name_ar ?? '',
    team_id: agent.team_id,
    photo_url: agent.photo_url,
    active: agent.active,
  }
}

async function submit() {
  if (!editing.value) return
  saving.value = true
  formError.value = null
  try {
    await saveAgent({
      id: editing.value.id ?? undefined,
      name: editing.value.name,
      name_ar: editing.value.name_ar || null,
      team_id: editing.value.team_id,
      photo_url: editing.value.photo_url,
      active: editing.value.active,
    })
    editing.value = null
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function remove(agent: AdminAgent) {
  if (!confirm(t('admin.confirmDeleteAgent', { name: agent.name }))) return
  try {
    await deleteAgent(agent.id)
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 font-semibold text-strong text-lg">
        {{ t('admin.agents') }}
        <span class="font-medium text-mute text-sm">({{ agents.length }})</span>
      </h2>
      <div class="flex items-center gap-2">
        <input
          v-model="search"
          type="search"
          :placeholder="t('search.placeholder')"
          :aria-label="t('search.placeholder')"
          :class="[FIELD, 'w-48 sm:w-64']"
        />
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
          @click="editing = blank(); formError = null"
        >
          <iconify-icon icon="mdi:plus" aria-hidden="true" />
          {{ t('admin.addAgent') }}
        </button>
      </div>
    </header>

    <form
      v-if="editing"
      class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-card p-4 lg:p-5 shadow-[var(--shadow-card)]"
      @submit.prevent="submit"
    >
      <PhotoField
        v-model="editing.photo_url"
        kind="agent"
        :record-id="editing.id"
        :name="editing.name || '؟'"
      />

      <div class="grid gap-3 sm:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameEn') }} *</span>
          <input v-model="editing.name" :class="FIELD" required placeholder="Omar Khaled" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.nameAr') }}</span>
          <input v-model="editing.name_ar" :class="FIELD" placeholder="عمر خالد" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('table.team') }}</span>
          <select v-model="editing.team_id" :class="FIELD">
            <option :value="null">— {{ t('admin.noTeam') }} —</option>
            <option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.name_ar || team.name }}
            </option>
          </select>
        </label>
      </div>

      <!-- يظهر فقط عند نقل مستشار موجود: يطمئن أن أرقام فريقه القديم لن تتحرك -->
      <p
        v-if="editing.id && editing.team_id !== agents.find((a) => a.id === editing!.id)?.team_id"
        role="note"
        class="m-0 flex items-start gap-2 rounded-lg bg-accent/10 px-3 py-2 text-caption text-strong"
      >
        <iconify-icon icon="mdi:swap-horizontal" aria-hidden="true" class="mt-0.5 shrink-0 text-accent-text text-base" />
        {{ t('admin.transferHint') }}
      </p>

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

    <ul class="m-0 p-0 list-none flex flex-col gap-2">
      <li
        v-for="agent in filtered"
        :key="agent.id"
        class="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
        :class="agent.active ? '' : 'opacity-60'"
      >
        <span
          class="size-11 shrink-0 overflow-hidden rounded-xl bg-avatar bg-cover bg-center outline outline-1 -outline-offset-1 outline-strong/10 flex items-center justify-center font-bold text-avatar-text text-caption"
          :style="agent.photo_url ? { backgroundImage: `url('${agent.photo_url}')` } : undefined"
        >{{ agent.photo_url ? '' : agent.name.slice(0, 2).toUpperCase() }}</span>

        <div class="min-w-0 flex-1">
          <p class="m-0 font-semibold text-strong truncate">
            {{ localName(agent.name, agent.name_ar) }}
          </p>
          <p class="m-0 text-caption text-mute truncate">
            {{ agent.team_name ? localName(agent.team_name, agent.team_name_ar) : t('admin.noTeam')
            }}<template v-if="!agent.active"> · {{ t('admin.inactive') }}</template>
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
          @click="edit(agent)"
        >{{ t('admin.edit') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          :aria-label="t('admin.delete')"
          @click="remove(agent)"
        >
          <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>
