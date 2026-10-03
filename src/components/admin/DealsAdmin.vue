<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useAdminData } from '@/composables/useAdminData'
import { useDeals } from '@/composables/useDeals'
import { useLocalName } from '@/composables/useLocalName'
import type { DealRow } from '@/lib/types'
import SearchSelect, { type SearchOption } from './SearchSelect.vue'
import { dayKey, NUMBER_LOCALE } from '@/lib/region'

/**
 * إدخال المبيعات صفقة صفقة: المستشار والتاريخ والمبلغ. الصفقة بتزوّد إجمالي
 * الربع بتاعها، والاحتفال بيظهر على الشاشات لوحده لو الربع هو الجاري.
 */
const { t, locale } = useI18n()
const localName = useLocalName()
const { agents, teams } = useAdminData()
const { deals, loading, load, addDeal, deleteDeal, developers, projects } = useDeals()

const form = ref({
  agentId: '', teamId: '', date: dayKey(), amount: '', developer: '', project: '',
  shared: false, partnerId: '', partnerTeamId: '', share: 50,
})
const saving = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)
const search = ref('')

onMounted(() => { void load() })

const options = computed<(SearchOption & { teamId: string })[]>(() => {
  const collator = new Intl.Collator(locale.value)
  return agents.value
    .filter((a) => a.active)
    .map((a) => ({
      id: a.id,
      label: localName(a.name, a.name_ar),
      hint: a.team_name ? localName(a.team_name, a.team_name_ar) : '',
      // البحث يلاقي الاسم باللغتين مهما كانت لغة العرض
      keywords: `${a.name} ${a.name_ar ?? ''}`,
      teamId: a.team_id ?? '',
    }))
    .sort((a, b) => collator.compare(a.label, b.label))
})

const teamOptions = computed(() => {
  const collator = new Intl.Collator(locale.value)
  return teams.value
    // الفريق الموقوف يظهر فقط لو هو المختار بالفعل
    .filter((team) => team.active || team.id === form.value.teamId || team.id === form.value.partnerTeamId)
    .map((team) => ({ id: team.id, label: localName(team.name, team.name_ar) }))
    .sort((a, b) => collator.compare(a.label, b.label))
})

const agentTeamId = computed(() => options.value.find((o) => o.id === form.value.agentId)?.teamId ?? '')
/** الصفقة هتتسجل لفريق غير فريق المستشار الحالي. */
const teamDiffers = computed(() => Boolean(form.value.agentId) && form.value.teamId !== agentTeamId.value)

// اختيار المستشار يملأ فريقه الحالي؛ وتقدر تغيّره قبل الإضافة
watch(() => form.value.agentId, () => { form.value.teamId = agentTeamId.value })

// الصفقة المشتركة: المستشار الثاني من غير الأول، وفريقه يتملى زي الأول
const partnerOptions = computed(() => options.value.filter((o) => o.id !== form.value.agentId))
watch(() => form.value.partnerId, (id) => {
  form.value.partnerTeamId = options.value.find((o) => o.id === id)?.teamId ?? ''
})
watch(() => form.value.agentId, (id) => { if (id && id === form.value.partnerId) form.value.partnerId = '' })

const amountValue = computed(() => Number(String(form.value.amount).replace(/[,\s]/g, '')) || 0)
const shareValue = computed(() => Math.round((Number(form.value.share) || 0) * 100) / 100)
const shareValid = computed(() => shareValue.value >= 1 && shareValue.value <= 99)
/** نفس تقريب القاعدة: نصيب الأول يتقرّب والباقي للثاني، فالمجموع = المبلغ بالضبط. */
const firstAmount = computed(() => Math.round(amountValue.value * shareValue.value) / 100)
const secondAmount = computed(() => Math.round((amountValue.value - firstAmount.value) * 100) / 100)
const partnerShare = computed(() => Math.round((100 - shareValue.value) * 100) / 100)

const valid = computed(() =>
  Boolean(form.value.agentId) && amountValue.value > 0 && form.value.date <= dayKey() &&
  (!form.value.shared || (Boolean(form.value.partnerId) && shareValid.value)),
)

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  message.value = null
  try {
    const result = await addDeal(
      form.value.agentId, form.value.date, amountValue.value, form.value.developer, form.value.project,
      form.value.teamId,
      form.value.shared
        ? { partnerId: form.value.partnerId, partnerTeamId: form.value.partnerTeamId, share: shareValue.value }
        : null,
    )
    const name = options.value.find((o) => o.id === form.value.agentId)?.label ?? ''
    const quarter = `Q${result.quarter} ${result.year}`
    message.value = {
      ok: true,
      text: form.value.shared
        ? t(result.celebrated ? 'deals.addedSharedCelebrated' : 'deals.addedSharedQuiet', {
            amount: compact(amountValue.value),
            name,
            first: compact(result.amount_egp),
            partner: options.value.find((o) => o.id === form.value.partnerId)?.label ?? '',
            second: compact(result.partner_amount_egp ?? 0),
            quarter,
          })
        : t(result.celebrated ? 'deals.addedCelebrated' : 'deals.addedQuiet', {
            amount: compact(amountValue.value),
            name,
            total: compact(result.total_egp),
            quarter,
          }),
    }
    // المبلغ بس اللي بيتفضّى: الإدخال عادةً بيكمّل على نفس المشروع
    form.value.amount = ''
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    saving.value = false
  }
}

async function remove(deal: DealRow) {
  const name = localName(deal.name, deal.name_ar)
  const question = deal.shared_id ? 'deals.confirmDeleteShared' : 'deals.confirmDelete'
  if (!confirm(t(question, { amount: compact(deal.amount_egp), name }))) return
  message.value = null
  try {
    await deleteDeal(deal.id)
    message.value = { ok: true, text: t('deals.deleted', { amount: compact(deal.amount_egp), name }) }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  // شريك كل صفقة مشتركة: الصف الآخر بنفس shared_id
  const partnerOf = (d: DealRow) => {
    if (!d.shared_id) return ''
    const other = deals.value.find((x) => x.shared_id === d.shared_id && x.id !== d.id)
    return other ? localName(other.name, other.name_ar) : ''
  }
  return deals.value
    .filter((d) => !q || d.name.toLowerCase().includes(q) || (d.name_ar ?? '').includes(q) ||
      (d.team ?? '').toLowerCase().includes(q) || (d.team_ar ?? '').includes(q) ||
      (d.developer ?? '').toLowerCase().includes(q) || (d.project ?? '').toLowerCase().includes(q))
    .map((d) => ({
      deal: d,
      name: localName(d.name, d.name_ar),
      team: d.team ? localName(d.team, d.team_ar) : '',
      partner: partnerOf(d),
      date: new Intl.DateTimeFormat(locale.value === 'ar' ? NUMBER_LOCALE.ar : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(`${d.deal_date}T12:00:00`)),
      period: `Q${d.quarter} ${d.year}`,
    }))
})

const listedTotal = computed(() => rows.value.reduce((s, r) => s + r.deal.amount_egp, 0))

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="m-0 font-semibold text-strong text-lg">{{ t('deals.title') }}</h2>
      <p class="m-0 mt-1 text-caption text-mute">{{ t('deals.hint') }}</p>
    </header>

    <!-- إضافة صفقة -->
    <form class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-card p-5 shadow-[var(--shadow-card)]" @submit.prevent="submit">
      <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.5fr_1fr_.9fr_1fr_1fr_1fr_auto] xl:items-end">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('table.agent') }} *</span>
          <SearchSelect
            v-model="form.agentId"
            :options="options"
            :placeholder="t('deals.agentSearch')"
            :empty-text="t('deals.agentNone')"
            :input-class="FIELD"
            required
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.team') }}</span>
          <select v-model="form.teamId" :class="[FIELD, teamDiffers ? 'border-gold' : '']">
            <option value="">{{ t('deals.noTeam') }}</option>
            <option v-for="o in teamOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.date') }} *</span>
          <input v-model="form.date" type="date" required :max="dayKey()" :class="FIELD" />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.developer') }}</span>
          <input
            v-model="form.developer"
            type="text"
            list="deal-developers"
            maxlength="80"
            :placeholder="t('deals.developerPlaceholder')"
            :class="FIELD"
          />
          <datalist id="deal-developers">
            <option v-for="name in developers" :key="name" :value="name" />
          </datalist>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.project') }}</span>
          <input
            v-model="form.project"
            type="text"
            list="deal-projects"
            maxlength="80"
            :placeholder="t('deals.projectPlaceholder')"
            :class="FIELD"
          />
          <datalist id="deal-projects">
            <option v-for="name in projects" :key="name" :value="name" />
          </datalist>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="flex items-center justify-between font-semibold text-caption text-mute">
            <span>{{ t('deals.amount') }} *</span>
            <b v-if="amountValue > 0" class="font-semibold tabular-nums text-accent-text">{{ egp(amountValue) }}</b>
          </span>
          <input
            v-model="form.amount"
            type="text"
            inputmode="numeric"
            required
            dir="ltr"
            :placeholder="t('deals.amountPlaceholder')"
            :class="[FIELD, 'text-end tabular-nums']"
          />
        </label>

        <button
          type="submit"
          class="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="!valid || saving"
        >
          <iconify-icon icon="mdi:plus-circle-outline" aria-hidden="true" class="text-lg" />
          {{ saving ? t('admin.saving') : t('deals.add') }}
        </button>
      </div>

      <label class="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-strong">
        <input v-model="form.shared" type="checkbox" class="size-4 accent-[var(--color-accent)]" />
        <iconify-icon icon="mdi:account-multiple-outline" aria-hidden="true" class="text-lg text-mute" />
        {{ t('deals.shared') }}
      </label>

      <div
        v-if="form.shared"
        class="grid gap-4 rounded-lg border border-card-border bg-page/60 p-4 lg:grid-cols-2 xl:grid-cols-[1.5fr_1fr_.8fr_1.6fr] xl:items-end"
      >
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.partner') }} *</span>
          <SearchSelect
            v-model="form.partnerId"
            :options="partnerOptions"
            :placeholder="t('deals.agentSearch')"
            :empty-text="t('deals.agentNone')"
            :input-class="FIELD"
            required
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.partnerTeam') }}</span>
          <select v-model="form.partnerTeamId" :class="FIELD">
            <option value="">{{ t('deals.noTeam') }}</option>
            <option v-for="o in teamOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.share') }} *</span>
          <input
            v-model.number="form.share"
            type="number"
            min="1"
            max="99"
            step="any"
            required
            dir="ltr"
            :class="[FIELD, 'text-end tabular-nums', shareValid ? '' : 'border-down']"
          />
        </label>

        <div class="flex flex-col gap-1.5">
          <input
            v-model.number="form.share"
            type="range"
            min="1"
            max="99"
            step="1"
            :aria-label="t('deals.share')"
            class="w-full accent-[var(--color-accent)]"
          />
          <p v-if="shareValid" class="m-0 flex flex-wrap justify-between gap-x-4 text-caption text-mute tabular-nums">
            <span>{{ t('deals.shareFirst', { pct: shareValue }) }}<b v-if="amountValue > 0" class="font-semibold text-strong"> · {{ egp(firstAmount) }}</b></span>
            <span>{{ t('deals.shareSecond', { pct: partnerShare }) }}<b v-if="amountValue > 0" class="font-semibold text-strong"> · {{ egp(secondAmount) }}</b></span>
          </p>
          <p v-else class="m-0 text-caption text-down">{{ t('deals.shareRule') }}</p>
        </div>
      </div>

      <p v-if="teamDiffers" class="m-0 flex items-start gap-1.5 text-caption font-medium text-gold">
        <iconify-icon icon="mdi:swap-horizontal" aria-hidden="true" class="mt-0.5 shrink-0" />
        {{ t('deals.teamDiffers') }}
      </p>

      <p class="m-0 flex items-start gap-1.5 text-caption text-mute">
        <iconify-icon icon="mdi:party-popper" aria-hidden="true" class="mt-0.5 shrink-0 text-gold" />
        {{ t('deals.celebrateNote') }}
      </p>

      <p
        v-if="message"
        :role="message.ok ? 'status' : 'alert'"
        class="m-0 text-sm font-medium"
        :class="message.ok ? 'text-accent-text' : 'text-down'"
      >{{ message.text }}</p>
    </form>

    <!-- آخر الصفقات -->
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h3 class="m-0 font-semibold text-strong">
        {{ t('deals.recent') }}
        <span class="font-medium text-mute text-sm">({{ rows.length }} · {{ compact(listedTotal) }})</span>
      </h3>
      <input
        v-model="search"
        type="search"
        :placeholder="t('deals.search')"
        :aria-label="t('deals.search')"
        :class="[FIELD, 'w-48 sm:w-64']"
      />
    </header>

    <p v-if="loading && !rows.length" class="m-0 text-mute text-sm">{{ t('admin.loading') }}</p>
    <p v-else-if="!rows.length" class="m-0 rounded-xl border border-dashed border-card-border px-4 py-10 text-center text-mute">
      {{ t('deals.empty') }}
    </p>

    <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="r in rows"
        :key="r.deal.id"
        class="flex flex-wrap items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
      >
        <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent-text" aria-hidden="true">
          <iconify-icon icon="mdi:cash-plus" class="text-xl" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="m-0 flex flex-wrap items-center gap-2 font-semibold text-strong">
            <span class="truncate">{{ r.name }}</span>
            <span
              v-if="r.deal.shared_id"
              class="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-caption font-semibold text-gold"
            >
              <iconify-icon icon="mdi:account-multiple-outline" aria-hidden="true" />
              {{ r.partner
                ? t('deals.sharedWith', { name: r.partner, pct: Number(r.deal.share_pct) })
                : t('deals.sharedBadge', { pct: Number(r.deal.share_pct) }) }}
            </span>
          </p>
          <p class="m-0 truncate text-caption text-mute">
            <template v-if="r.deal.project">
              <b class="font-semibold text-strong">{{ r.deal.project }}</b><template v-if="r.deal.developer"> — {{ r.deal.developer }}</template> ·
            </template>
            <template v-else-if="r.deal.developer">{{ r.deal.developer }} · </template>
            <template v-if="r.team">{{ r.team }} · </template>{{ r.date }} · {{ r.period }}
          </p>
        </div>
        <b class="shrink-0 font-bold tabular-nums text-strong text-lg" :title="egp(r.deal.amount_egp)">
          {{ compact(r.deal.amount_egp) }}
        </b>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down"
          :aria-label="t('admin.delete')"
          @click="remove(r.deal)"
        >
          <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </section>
</template>
