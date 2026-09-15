<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { compact, egp, percent } from '@/lib/format'
import { useAdminData } from '@/composables/useAdminData'
import { useLocalName } from '@/composables/useLocalName'
import { exportRows } from '@/lib/workbook'
import type { AgentStanding, TeamContribution, TeamStanding } from '@/lib/types'

type ReportKind = 'exec' | 'branch' | 'agent' | 'hr'

const { t } = useI18n()
const { year, quarter, setQuarter } = useAdminData()
const local = useLocalName()

const kind = ref<ReportKind>('exec')
const branchName = ref('')
const agentName = ref('')

const teamRows = ref<TeamStanding[]>([])
const agentRows = ref<AgentStanding[]>([])
/** كل أرباع السنة — يحتاجها تقرير المستشار الفردي. */
const agentYearRows = ref<AgentStanding[]>([])
/** مساهمة كل مستشار في كل فريق — أساس تقرير الفريق. */
const contributions = ref<TeamContribution[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)

/** أقل من هذا يُعدّ متأخراً في تقرير الموارد البشرية. */
const AT_RISK_PCT = 70

async function load() {
  loading.value = true
  error.value = null
  try {
    const [teamRes, agentRes, yearRes, contribRes] = await Promise.all([
      supabase.from('lb_team_standings').select('*')
        .eq('year', year.value).eq('quarter', quarter.value).order('rank'),
      supabase.from('lb_agent_standings').select('*')
        .eq('year', year.value).eq('quarter', quarter.value).order('rank'),
      supabase.from('lb_agent_standings').select('*').eq('year', year.value),
      supabase.from('lb_team_contributions').select('*')
        .eq('year', year.value).eq('quarter', quarter.value).order('rank'),
    ])
    if (teamRes.error) throw teamRes.error
    if (agentRes.error) throw agentRes.error
    if (yearRes.error) throw yearRes.error
    if (contribRes.error) throw contribRes.error
    teamRows.value = (teamRes.data ?? []) as TeamStanding[]
    agentRows.value = (agentRes.data ?? []) as AgentStanding[]
    agentYearRows.value = (yearRes.data ?? []) as AgentStanding[]
    contributions.value = (contribRes.data ?? []) as TeamContribution[]
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([year, quarter], load)

/**
 * القيمة تبقى الاسم الإنجليزي لأنه مفتاح الربط في الاستعلامات، والمعروض
 * مترجم — وإلا ظهرت قائمة إنجليزية فوق جدول عربي.
 */
const branchOptions = computed(() =>
  teamRows.value.map((r) => ({ value: r.name, label: local(r.name, r.name_ar) })),
)
const agentOptions = computed(() =>
  agentRows.value.map((r) => ({ value: r.name, label: local(r.name, r.name_ar) })),
)

const branches = computed(() => teamRows.value.map((r) => r.name))
const agentNames = computed(() => agentRows.value.map((r) => r.name))

// الاختيار الافتراضي يتبع البيانات: أول فرع/مستشار متاح
watch(branches, (list) => {
  if (!list.includes(branchName.value)) branchName.value = list[0] ?? ''
}, { immediate: true })
watch(agentNames, (list) => {
  if (!list.includes(agentName.value)) agentName.value = list[0] ?? ''
}, { immediate: true })

const totals = computed(() => {
  const deals = teamRows.value.reduce((s, r) => s + (Number(r.deals) || 0), 0)
  const target = teamRows.value.reduce((s, r) => s + (Number(r.target) || 0), 0)
  const members = teamRows.value.reduce((s, r) => s + (Number(r.members) || 0), 0)
  return { deals, target, members, pct: target > 0 ? Math.round((deals / target) * 100) : 0 }
})

const branch = computed(() => teamRows.value.find((r) => r.name === branchName.value) ?? null)
/**
 * من المساهمات لا من فريق المستشار الحالي: مستشار انتقل يبقى ظاهراً في تقرير
 * فريقه القديم بما باعه له، فيتطابق الجدول مع إجمالي الفريق.
 */
const branchAgents = computed<AgentStanding[]>(() =>
  contributions.value.filter((r) => r.team === branchName.value),
)

const agent = computed(() => agentRows.value.find((r) => r.name === agentName.value) ?? null)
const agentQuarters = computed(() =>
  agentYearRows.value
    .filter((r) => r.name === agentName.value)
    .sort((a, b) => a.quarter - b.quarter),
)

const hrBuckets = computed(() => {
  let ahead = 0, onTrack = 0, behind = 0
  for (const r of agentRows.value) {
    if (r.pct >= 100) ahead++
    else if (r.pct >= AT_RISK_PCT) onTrack++
    else behind++
  }
  return { ahead, onTrack, behind }
})

const atRisk = computed(() =>
  agentRows.value.filter((r) => r.pct < AT_RISK_PCT).sort((a, b) => a.pct - b.pct),
)

const topAgents = computed(() => agentRows.value.slice(0, 5))

const title = computed(() => t(`report.${kind.value}`))
const periodLabel = computed(() => `${t('quarter.short', { n: quarter.value })} ${year.value}`)

/** كل تقرير يصدّر جدوله الأساسي — نفس ما يظهر على الشاشة. */
async function onExport() {
  busy.value = true
  try {
    let header: string[] = []
    let rows: (string | number)[][] = []

    if (kind.value === 'exec') {
      header = [t('table.rank'), t('table.team'), t('table.members'), t('table.sales'), t('table.target'), t('table.progressShort')]
      rows = teamRows.value.map((r) => [r.rank, local(r.name, r.name_ar), r.members, Number(r.deals) || 0, Number(r.target) || 0, r.pct])
    } else if (kind.value === 'branch') {
      header = [t('table.rank'), t('table.agent'), t('table.sales'), t('table.target'), t('table.progressShort')]
      rows = branchAgents.value.map((r) => [r.rank, local(r.name, r.name_ar), Number(r.deals) || 0, Number(r.target) || 0, r.pct])
    } else if (kind.value === 'agent') {
      header = [t('quarter.label'), t('table.sales'), t('table.target'), t('table.progressShort'), t('table.rank')]
      rows = agentQuarters.value.map((r) => [r.quarter, Number(r.deals) || 0, Number(r.target) || 0, r.pct, r.rank])
    } else {
      header = [t('table.agent'), t('table.team'), t('table.sales'), t('table.target'), t('table.progressShort')]
      rows = atRisk.value.map((r) => [local(r.name, r.name_ar), r.team ? local(r.team, r.team_ar) : '', Number(r.deals) || 0, Number(r.target) || 0, r.pct])
    }

    await exportRows(title.value, header, rows, `Everest-${kind.value}-Q${quarter.value}-${year.value}.xlsx`)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

/** PDF عبر نافذة الطباعة — أنماط @media print تخفي عناصر التحكم تلقائياً. */
function onPrint() {
  const original = document.title
  document.title = `${title.value} — ${periodLabel.value}`
  window.print()
  document.title = original
}

const KINDS: ReportKind[] = ['exec', 'branch', 'agent', 'hr']
const quarters = [1, 2, 3, 4]

const FIELD =
  'rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const TH = 'px-4 py-3 text-start font-medium text-mute whitespace-nowrap'
const TD = 'px-4 py-2.5 whitespace-nowrap'
const CARD = 'rounded-xl border border-card-border bg-card px-5 py-4'
</script>

<template>
  <section class="flex flex-col gap-5">
    <!-- عناصر التحكم تختفي من الطباعة، فالورقة تحمل التقرير وحده -->
    <header class="flex flex-wrap items-end justify-between gap-3" data-export-hide>
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.reports') }}</h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('report.hint') }}</p>
      </div>

      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('report.type') }}</span>
          <select v-model="kind" :class="FIELD">
            <option v-for="k in KINDS" :key="k" :value="k">{{ t(`report.${k}`) }}</option>
          </select>
        </label>

        <label v-if="kind === 'branch'" class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('table.team') }}</span>
          <select v-model="branchName" :class="FIELD">
            <option v-for="b in branchOptions" :key="b.value" :value="b.value">{{ b.label }}</option>
          </select>
        </label>

        <label v-if="kind === 'agent'" class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('table.agent') }}</span>
          <select v-model="agentName" :class="FIELD">
            <option v-for="a in agentOptions" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </label>

        <div class="flex items-center gap-1 rounded-lg border border-card-border bg-card p-1" role="tablist">
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

        <button
          type="button"
          class="rounded-lg border border-card-border px-4 py-2 text-sm font-semibold text-strong transition-colors hover:bg-accent/10"
          @click="onPrint"
        >{{ t('report.print') }}</button>

        <button
          type="button"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy || loading"
          @click="onExport"
        >{{ busy ? t('admin.exporting') : t('report.excel') }}</button>
      </div>
    </header>

    <p v-if="error" role="alert" class="m-0 font-medium text-down text-sm">{{ error }}</p>
    <p v-if="loading" class="m-0 font-medium text-mute text-sm">{{ t('admin.loading') }}</p>

    <div v-else class="flex flex-col gap-5">
      <div class="flex items-baseline justify-between gap-3 border-b border-card-border pb-3">
        <h3 class="m-0 font-semibold text-strong text-xl">{{ title }}</h3>
        <span class="font-medium tabular-nums text-mute text-sm">{{ periodLabel }}</span>
      </div>

      <!-- الإدارة العليا -->
      <template v-if="kind === 'exec'">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.totalSales') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric" :title="egp(totals.deals)">
              {{ compact(totals.deals) }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.totalTarget') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric" :title="egp(totals.target)">
              {{ compact(totals.target) }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.achievement') }}</div>
            <div class="font-bold tabular-nums text-accent-text text-metric">{{ percent(totals.pct) }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.headcount') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric">{{ totals.members }}</div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-card-border bg-card-alt">
                <th :class="TH">{{ t('table.rank') }}</th>
                <th :class="TH">{{ t('table.team') }}</th>
                <th :class="TH">{{ t('table.members') }}</th>
                <th :class="TH">{{ t('table.sales') }}</th>
                <th :class="TH">{{ t('table.target') }}</th>
                <th :class="TH">{{ t('table.progressShort') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in teamRows" :key="r.team_id" class="border-b border-divider last:border-b-0">
                <td :class="[TD, 'font-bold tabular-nums']">{{ r.rank }}</td>
                <td :class="[TD, 'font-semibold text-strong']">{{ local(r.name, r.name_ar) }}</td>
                <td :class="[TD, 'tabular-nums text-mute']">{{ r.members }}</td>
                <td :class="[TD, 'font-semibold tabular-nums']" :title="egp(r.deals)">{{ compact(r.deals) }}</td>
                <td :class="[TD, 'tabular-nums text-mute']" :title="egp(r.target)">{{ compact(r.target) }}</td>
                <td :class="[TD, 'tabular-nums font-semibold']">{{ percent(r.pct) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h4 class="m-0 mb-2 font-semibold text-strong">{{ t('report.topPerformers') }}</h4>
          <ol class="m-0 flex flex-col gap-1.5 ps-5 text-sm">
            <li v-for="a in topAgents" :key="a.agent_id" class="text-mute">
              <b class="font-semibold text-strong">{{ local(a.name, a.name_ar) }}</b>
              — {{ compact(a.deals) }} · {{ percent(a.pct) }}
            </li>
          </ol>
        </div>
      </template>

      <!-- تقرير فرع -->
      <template v-else-if="kind === 'branch'">
        <div v-if="branch" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.rank') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric">{{ branch.rank }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.sales') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric" :title="egp(branch.deals)">
              {{ compact(branch.deals) }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.target') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric" :title="egp(branch.target)">
              {{ compact(branch.target) }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.achievement') }}</div>
            <div class="font-bold tabular-nums text-accent-text text-metric">{{ percent(branch.pct) }}</div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-card-border bg-card-alt">
                <th :class="TH">{{ t('table.rank') }}</th>
                <th :class="TH">{{ t('table.agent') }}</th>
                <th :class="TH">{{ t('table.sales') }}</th>
                <th :class="TH">{{ t('table.target') }}</th>
                <th :class="TH">{{ t('table.progressShort') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in branchAgents" :key="a.agent_id" class="border-b border-divider last:border-b-0">
                <td :class="[TD, 'font-bold tabular-nums']">{{ a.rank }}</td>
                <td :class="[TD, 'font-semibold text-strong']">{{ local(a.name, a.name_ar) }}</td>
                <td :class="[TD, 'font-semibold tabular-nums']" :title="egp(a.deals)">{{ compact(a.deals) }}</td>
                <td :class="[TD, 'tabular-nums text-mute']" :title="egp(a.target)">{{ compact(a.target) }}</td>
                <td :class="[TD, 'tabular-nums font-semibold']">{{ percent(a.pct) }}</td>
              </tr>
              <tr v-if="!branchAgents.length">
                <td colspan="5" class="px-4 py-8 text-center text-mute">{{ t('admin.noAgents') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- تقرير مستشار -->
      <template v-else-if="kind === 'agent'">
        <div v-if="agent" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.team') }}</div>
            <div class="font-semibold text-strong text-lg">
              {{ agent.team ? local(agent.team, agent.team_ar) : '—' }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.rank') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric">{{ agent.rank }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('table.sales') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric" :title="egp(agent.deals)">
              {{ compact(agent.deals) }}
            </div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.achievement') }}</div>
            <div class="font-bold tabular-nums text-accent-text text-metric">{{ percent(agent.pct) }}</div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-card-border bg-card-alt">
                <th :class="TH">{{ t('quarter.label') }}</th>
                <th :class="TH">{{ t('table.sales') }}</th>
                <th :class="TH">{{ t('table.target') }}</th>
                <th :class="TH">{{ t('table.progressShort') }}</th>
                <th :class="TH">{{ t('table.rank') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in agentQuarters" :key="q.quarter" class="border-b border-divider last:border-b-0">
                <td :class="[TD, 'font-semibold text-strong']">{{ t('quarter.short', { n: q.quarter }) }}</td>
                <td :class="[TD, 'font-semibold tabular-nums']" :title="egp(q.deals)">{{ compact(q.deals) }}</td>
                <td :class="[TD, 'tabular-nums text-mute']" :title="egp(q.target)">{{ compact(q.target) }}</td>
                <td :class="[TD, 'tabular-nums font-semibold']">{{ percent(q.pct) }}</td>
                <td :class="[TD, 'tabular-nums text-mute']">{{ q.rank }}</td>
              </tr>
              <tr v-if="!agentQuarters.length">
                <td colspan="5" class="px-4 py-8 text-center text-mute">{{ t('report.noData') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- الموارد البشرية -->
      <template v-else>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.headcount') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric">{{ agentRows.length }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.ahead') }}</div>
            <div class="font-bold tabular-nums text-accent-text text-metric">{{ hrBuckets.ahead }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.onTrack') }}</div>
            <div class="font-bold tabular-nums text-strong text-metric">{{ hrBuckets.onTrack }}</div>
          </div>
          <div :class="CARD">
            <div class="text-caption text-mute">{{ t('report.behind') }}</div>
            <div class="font-bold tabular-nums text-down text-metric">{{ hrBuckets.behind }}</div>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-2 font-semibold text-strong">{{ t('report.byBranch') }}</h4>
          <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="border-b border-card-border bg-card-alt">
                  <th :class="TH">{{ t('table.team') }}</th>
                  <th :class="TH">{{ t('table.members') }}</th>
                  <th :class="TH">{{ t('report.achievement') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in teamRows" :key="r.team_id" class="border-b border-divider last:border-b-0">
                  <td :class="[TD, 'font-semibold text-strong']">{{ local(r.name, r.name_ar) }}</td>
                  <td :class="[TD, 'tabular-nums text-mute']">{{ r.members }}</td>
                  <td :class="[TD, 'tabular-nums font-semibold']">{{ percent(r.pct) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 class="m-0 mb-2 font-semibold text-strong">{{ t('report.atRisk', { pct: AT_RISK_PCT }) }}</h4>
          <div class="overflow-x-auto rounded-xl border border-card-border bg-card">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="border-b border-card-border bg-card-alt">
                  <th :class="TH">{{ t('table.agent') }}</th>
                  <th :class="TH">{{ t('table.team') }}</th>
                  <th :class="TH">{{ t('table.sales') }}</th>
                  <th :class="TH">{{ t('table.target') }}</th>
                  <th :class="TH">{{ t('table.progressShort') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in atRisk" :key="a.agent_id" class="border-b border-divider last:border-b-0">
                  <td :class="[TD, 'font-semibold text-strong']">{{ local(a.name, a.name_ar) }}</td>
                  <td :class="[TD, 'text-mute']">{{ a.team ? local(a.team, a.team_ar) : '—' }}</td>
                  <td :class="[TD, 'tabular-nums']" :title="egp(a.deals)">{{ compact(a.deals) }}</td>
                  <td :class="[TD, 'tabular-nums text-mute']" :title="egp(a.target)">{{ compact(a.target) }}</td>
                  <td :class="[TD, 'tabular-nums font-semibold text-down']">{{ percent(a.pct) }}</td>
                </tr>
                <tr v-if="!atRisk.length">
                  <td colspan="5" class="px-4 py-8 text-center text-mute">{{ t('report.noneAtRisk') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
