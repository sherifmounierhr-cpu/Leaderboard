<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useScreenAdmin } from '@/composables/useScreenAdmin'

/**
 * التحكم في العرض: مفاتيح إظهار/إخفاء بتتطبّق فوراً على كل الشاشات (من غير زرار
 * حفظ). كل مفتاح عمود في board_settings وبيوصل الشاشات عبر الـ realtime.
 * مفتاح جديد = عنصر في FLAGS + عمود/RPC في القاعدة + قراءته في الشاشة.
 */
const { t } = useI18n()
const { settings, saveDisplayFlag } = useScreenAdmin()

interface Flag {
  key: string
  icon: string
  label: string
  hint: string
  value: () => boolean
  save: (on: boolean) => Promise<void>
}

const FLAGS: Flag[] = [
  {
    key: 'hide_agent_sales',
    icon: 'mdi:eye-off-outline',
    label: 'screen.hideAgentSales',
    hint: 'screen.hideAgentSalesHint',
    value: () => settings.value.hide_agent_sales === true,
    save: (on) => saveDisplayFlag('hide_agent_sales', on),
  },
  {
    key: 'hide_markets',
    icon: 'mdi:chart-line-variant',
    label: 'screen.hideMarkets',
    hint: 'screen.hideMarketsHint',
    value: () => settings.value.hide_markets === true,
    save: (on) => saveDisplayFlag('hide_markets', on),
  },
  {
    key: 'hide_insights',
    icon: 'mdi:chart-timeline-variant',
    label: 'screen.hideInsights',
    hint: 'screen.hideInsightsHint',
    value: () => settings.value.hide_insights === true,
    save: (on) => saveDisplayFlag('hide_insights', on),
  },
]

const busy = ref<string | null>(null)
const message = ref<{ ok: boolean; text: string } | null>(null)

async function toggle(flag: Flag, event: Event) {
  const on = (event.target as HTMLInputElement).checked
  busy.value = flag.key
  message.value = null
  try {
    await flag.save(on)
    message.value = { ok: true, text: t('screen.settingsSaved') }
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h2 class="admin-title">{{ t('nav.display') }}</h2>
      <p class="m-0 mt-1 text-caption text-mute">{{ t('nav.displayHint') }}</p>
    </header>

    <ul class="m-0 flex max-w-2xl list-none flex-col gap-3 p-0">
      <li v-for="flag in FLAGS" :key="flag.key">
        <label class="flex cursor-pointer items-start gap-3 rounded-xl border border-card-border bg-card px-5 py-4 shadow-[var(--shadow-panel)]">
          <input
            type="checkbox"
            class="mt-1 size-4 accent-[var(--color-accent)]"
            :checked="flag.value()"
            :disabled="busy === flag.key"
            @change="toggle(flag, $event)"
          />
          <iconify-icon :icon="flag.icon" aria-hidden="true" class="mt-0.5 text-xl text-accent-text" />
          <span class="flex flex-col gap-0.5">
            <span class="text-sm font-semibold text-strong">{{ t(flag.label) }}</span>
            <span class="text-caption text-mute leading-snug">{{ t(flag.hint) }}</span>
          </span>
        </label>
      </li>
    </ul>

    <p
      v-if="message"
      :role="message.ok ? 'status' : 'alert'"
      class="m-0 text-sm font-medium"
      :class="message.ok ? 'text-accent-text' : 'text-down'"
    >{{ message.text }}</p>
  </section>
</template>
