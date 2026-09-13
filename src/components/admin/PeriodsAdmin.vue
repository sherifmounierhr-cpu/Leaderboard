<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useAdminData } from '@/composables/useAdminData'
import { useLocalName } from '@/composables/useLocalName'

const { agents, periods, year, quarter, setQuarter, savePeriod, loadPeriods } = useAdminData()
const { t } = useI18n()
const localName = useLocalName()

interface Draft {
  target: number
  deals: number
}

/** مسودّات محلية: لا شيء يُكتب حتى يضغط المستخدم حفظ — أرقام مال لا تُحفظ بالخطأ. */
const drafts = reactive<Record<string, Draft>>({})
const savingId = ref<string | null>(null)
const rowError = reactive<Record<string, string>>({})
const search = ref('')

function seed() {
  for (const key of Object.keys(drafts)) delete drafts[key]
  for (const agent of agents.value) {
    const row = periods.value.get(agent.id)
    drafts[agent.id] = { target: row?.target_egp ?? 0, deals: row?.amount_egp ?? 0 }
  }
}

watch([agents, periods], seed, { immediate: true, deep: false })

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return agents.value
    .filter((a) => a.active)
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.name_ar ?? '').toLowerCase().includes(q) ||
        (a.team_name ?? '').toLowerCase().includes(q) ||
        (a.team_name_ar ?? '').toLowerCase().includes(q),
    )
})

function isDirty(id: string) {
  const row = periods.value.get(id)
  const draft = drafts[id]
  if (!draft) return false
  return draft.target !== (row?.target_egp ?? 0) || draft.deals !== (row?.amount_egp ?? 0)
}

const dirtyIds = computed(() => rows.value.filter((a) => isDirty(a.id)).map((a) => a.id))

async function save(id: string) {
  const draft = drafts[id]
  if (!draft) return
  savingId.value = id
  delete rowError[id]
  try {
    await savePeriod(id, Number(draft.target) || 0, Number(draft.deals) || 0)
  } catch (err) {
    rowError[id] = err instanceof Error ? err.message : String(err)
  } finally {
    savingId.value = null
  }
}

async function saveAll() {
  for (const id of [...dirtyIds.value]) await save(id)
}

const quarters = [1, 2, 3, 4]

async function changeYear(value: number) {
  year.value = value
  await loadPeriods()
}

const NUM =
  'w-32 rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong tabular-nums text-end focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.periods') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('admin.periodsHint') }}</p>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.year') }}</span>
          <input
            :value="year"
            type="number"
            min="2020"
            max="2100"
            class="w-24 rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            @change="changeYear(Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <div
          class="flex items-center gap-1 rounded-lg border border-card-border bg-card p-1"
          role="tablist"
          :aria-label="t('quarter.label')"
        >
          <button
            v-for="q in quarters"
            :key="q"
            type="button"
            role="tab"
            :aria-selected="quarter === q"
            class="rounded-md px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors"
            :class="quarter === q ? 'bg-accent text-white' : 'text-mute hover:text-strong'"
            @click="setQuarter(q)"
          >{{ t('quarter.short', { n: q }) }}</button>
        </div>

        <input
          v-model="search"
          type="search"
          :placeholder="t('search.placeholder')"
          :aria-label="t('search.placeholder')"
          class="w-44 rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />

        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-40"
          :disabled="!dirtyIds.length"
          @click="saveAll"
        >
          {{ dirtyIds.length ? t('admin.saveAllCount', { n: dirtyIds.length }) : t('admin.saveAll') }}
        </button>
      </div>
    </header>

    <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-card-border bg-card-alt">
            <th class="px-4 py-3 text-start font-medium text-mute whitespace-nowrap">
              {{ t('table.agent') }}
            </th>
            <th class="px-4 py-3 text-start font-medium text-mute whitespace-nowrap">
              {{ t('table.team') }}
            </th>
            <th class="px-4 py-3 text-end font-medium text-mute whitespace-nowrap">
              {{ t('table.target') }}
            </th>
            <th class="px-4 py-3 text-end font-medium text-mute whitespace-nowrap">
              {{ t('table.sales') }}
            </th>
            <th class="px-4 py-3 text-end font-medium text-mute whitespace-nowrap">
              {{ t('admin.action') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="agent in rows"
            :key="agent.id"
            class="border-b border-divider last:border-b-0"
            :class="isDirty(agent.id) ? 'bg-accent/[0.05]' : ''"
          >
            <td class="px-4 py-2.5 font-semibold text-strong whitespace-nowrap">
              {{ localName(agent.name, agent.name_ar) }}
            </td>
            <td class="px-4 py-2.5 text-mute whitespace-nowrap">
              {{ agent.team_name ? localName(agent.team_name, agent.team_name_ar) : '—' }}
            </td>
            <td class="px-4 py-2.5 text-end">
              <input
                v-if="drafts[agent.id]"
                v-model.number="drafts[agent.id].target"
                type="number"
                min="0"
                step="1000"
                :class="NUM"
                :aria-label="`${t('table.target')} — ${agent.name}`"
              />
              <span class="block mt-0.5 text-eyebrow text-dim tabular-nums">
                {{ egp(drafts[agent.id]?.target ?? 0) }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-end">
              <input
                v-if="drafts[agent.id]"
                v-model.number="drafts[agent.id].deals"
                type="number"
                min="0"
                step="1000"
                :class="NUM"
                :aria-label="`${t('table.sales')} — ${agent.name}`"
              />
              <span class="block mt-0.5 text-eyebrow text-dim tabular-nums">
                {{ compact(drafts[agent.id]?.deals ?? 0) }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-end whitespace-nowrap">
              <button
                v-if="isDirty(agent.id)"
                type="button"
                class="rounded-lg border border-accent px-3 py-1.5 text-caption font-semibold text-accent-text transition-colors hover:bg-accent/10 disabled:opacity-50"
                :disabled="savingId === agent.id"
                @click="save(agent.id)"
              >{{ savingId === agent.id ? t('admin.saving') : t('admin.save') }}</button>
              <iconify-icon
                v-else
                icon="mdi:check"
                aria-hidden="true"
                class="text-accent-live text-lg"
              />
              <p v-if="rowError[agent.id]" role="alert" class="m-0 text-eyebrow text-down">
                {{ rowError[agent.id] }}
              </p>
            </td>
          </tr>

          <tr v-if="!rows.length">
            <td colspan="5" class="px-4 py-10 text-center font-medium text-mute">
              {{ t('admin.noAgents') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
