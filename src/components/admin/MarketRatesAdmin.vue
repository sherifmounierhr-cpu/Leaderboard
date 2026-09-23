<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useBoardMedia } from '@/composables/useBoardMedia'

/**
 * أسعار فائدة البنك المركزي المصري.
 *
 * بتتدخّل بالإيد لأن موقع المركزي بيرفض أي طلب آلي، ومفيش مصدر مجاني موثوق
 * للكوريدور المصري. بتتغيّر في اجتماعات لجنة السياسة النقدية بس، فدخول رقمين
 * كل شهرين مقبول، والشاشة بتعرض تاريخ القرار جنبهم فمحدش يقرا رقم قديم
 * وهو فاكره النهارده.
 *
 * سعر الفيدرالي الأمريكي بييجي لوحده من FRED، فمش محتاج إدخال.
 */

/** بعد كده الأرقام محتاجة مراجعة: اللجنة بتجتمع كل ٦–٨ أسابيع. */
const STALE_DAYS = 120

const { t, locale } = useI18n()
const { isDemo } = useAuth()
const { settings, reload } = useBoardMedia()

const form = ref({ deposit: '', lending: '', at: '' })
const busy = ref(false)
const notice = ref<{ ok: boolean; text: string } | null>(null)

/** نملا النموذج من المحفوظ أول ما يوصل، وما نلغيش كتابة المستخدم بعدها. */
let filled = false
watch(
  settings,
  (value) => {
    if (filled) return
    if (value.cbe_deposit === undefined) return
    filled = true
    form.value = {
      deposit: value.cbe_deposit === null ? '' : String(value.cbe_deposit),
      lending: value.cbe_lending === null ? '' : String(value.cbe_lending),
      at: value.cbe_rates_at ?? '',
    }
  },
  { immediate: true, deep: true },
)

const savedAt = computed(() => {
  void locale.value
  const at = settings.value.cbe_rates_at
  if (!at) return null
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  return {
    // nu-latn: باقي أرقام الصفحة لاتينية
    text: new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(date),
    stale: days > STALE_DAYS,
  }
})

const today = new Date().toISOString().slice(0, 10)

async function save() {
  busy.value = true
  notice.value = null
  try {
    const num = (raw: string) => (raw.trim() === '' ? null : Number(raw))
    const { error } = await supabase.rpc('lb_admin_save_cbe_rates', {
      p_deposit: num(form.value.deposit),
      p_lending: num(form.value.lending),
      p_at: form.value.at || null,
    })
    if (error) throw new Error(error.message)
    await reload()
    notice.value = { ok: true, text: t('rates.saved') }
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    busy.value = false
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <section class="flex max-w-xl flex-col gap-4 rounded-xl border border-card-border bg-card p-5 shadow-[var(--shadow-panel)]">
    <header class="flex flex-col gap-1">
      <h2 class="m-0 font-semibold text-strong text-lg">{{ t('rates.title') }}</h2>
      <p class="m-0 text-caption text-mute leading-relaxed">{{ t('rates.hint') }}</p>
    </header>

    <p
      v-if="savedAt"
      class="m-0 text-caption"
      :class="savedAt.stale ? 'font-semibold text-gold' : 'text-dim'"
    >
      {{ t('rates.current', { when: savedAt.text }) }}
      <template v-if="savedAt.stale"> · {{ t('rates.stale') }}</template>
    </p>

    <form class="flex flex-col gap-4" @submit.prevent="save">
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('markets.name.cbe_deposit') }}</span>
          <input v-model="form.deposit" type="number" step="0.25" min="0" max="60" dir="ltr" :class="FIELD" placeholder="21.00" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('markets.name.cbe_lending') }}</span>
          <input v-model="form.lending" type="number" step="0.25" min="0" max="60" dir="ltr" :class="FIELD" placeholder="22.00" />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('rates.date') }}</span>
          <input v-model="form.at" type="date" :max="today" dir="ltr" :class="FIELD" />
        </label>
      </div>

      <p v-if="notice" :role="notice.ok ? 'status' : 'alert'" class="m-0 text-sm font-medium" :class="notice.ok ? 'text-accent-text' : 'text-down'">
        {{ notice.text }}
      </p>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy || isDemo"
        >{{ busy ? t('admin.saving') : t('admin.save') }}</button>
        <p class="m-0 text-caption text-dim">{{ t('rates.fed') }}</p>
      </div>
    </form>
  </section>
</template>
