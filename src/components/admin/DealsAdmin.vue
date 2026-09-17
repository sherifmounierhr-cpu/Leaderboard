<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, egp } from '@/lib/format'
import { useAdminData } from '@/composables/useAdminData'
import { useDeals } from '@/composables/useDeals'
import { useLocalName } from '@/composables/useLocalName'
import type { DealRow } from '@/lib/types'

/**
 * إدخال المبيعات صفقة صفقة: المستشار والتاريخ والمبلغ. الصفقة بتزوّد إجمالي
 * الربع بتاعها، والاحتفال بيظهر على الشاشات لوحده لو الربع هو الجاري.
 */
const { t, locale } = useI18n()
const localName = useLocalName()
const { agents } = useAdminData()
const { deals, loading, load, addDeal, deleteDeal } = useDeals()

/** تاريخ النهاردة بتوقيت القاهرة — نفس اليوم اللي الخادم بيقارن بيه. */
function cairoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

const form = ref({ agentId: '', date: cairoToday(), amount: '' })
const saving = ref(false)
const message = ref<{ ok: boolean; text: string } | null>(null)
const search = ref('')

onMounted(() => { void load() })

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

const amountValue = computed(() => Number(String(form.value.amount).replace(/[,\s]/g, '')) || 0)
const valid = computed(() => Boolean(form.value.agentId) && amountValue.value > 0 && form.value.date <= cairoToday())

async function submit() {
  if (!valid.value || saving.value) return
  saving.value = true
  message.value = null
  try {
    const result = await addDeal(form.value.agentId, form.value.date, amountValue.value)
    const name = options.value.find((o) => o.id === form.value.agentId)?.label ?? ''
    message.value = {
      ok: true,
      text: t(result.celebrated ? 'deals.addedCelebrated' : 'deals.addedQuiet', {
        amount: compact(amountValue.value),
        name,
        total: compact(result.total_egp),
        quarter: `Q${result.quarter} ${result.year}`,
      }),
    }
    form.value.amount = ''
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    saving.value = false
  }
}

async function remove(deal: DealRow) {
  const name = localName(deal.name, deal.name_ar)
  if (!confirm(t('deals.confirmDelete', { amount: compact(deal.amount_egp), name }))) return
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
  return deals.value
    .filter((d) => !q || d.name.toLowerCase().includes(q) || (d.name_ar ?? '').includes(q) ||
      (d.team ?? '').toLowerCase().includes(q) || (d.team_ar ?? '').includes(q))
    .map((d) => ({
      deal: d,
      name: localName(d.name, d.name_ar),
      team: d.team ? localName(d.team, d.team_ar) : '',
      date: new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
      <div class="grid gap-4 lg:grid-cols-[2fr_1fr_1.2fr_auto] lg:items-end">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('table.agent') }} *</span>
          <select v-model="form.agentId" required :class="FIELD">
            <option value="" disabled>{{ t('admin.celebratePick') }}</option>
            <option v-for="o in options" :key="o.id" :value="o.id">
              {{ o.team ? `${o.label} — ${o.team}` : o.label }}
            </option>
          </select>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('deals.date') }} *</span>
          <input v-model="form.date" type="date" required :max="cairoToday()" :class="FIELD" />
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
        :placeholder="t('search.placeholder')"
        :aria-label="t('search.placeholder')"
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
          <p class="m-0 truncate font-semibold text-strong">{{ r.name }}</p>
          <p class="m-0 truncate text-caption text-mute">
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
