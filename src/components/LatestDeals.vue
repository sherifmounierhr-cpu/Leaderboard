<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, relativeTime } from '@/lib/format'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import Avatar from './Avatar.vue'

/**
 * آخر الصفقات والتهاني. بصيغتين:
 * - list: بطاقة تحت متصدّر المستشارين، تملى المساحة الفاضية تحتها.
 * - ticker: سطر واحد يتبدّل في ترويسة الكشك، حيث الإشعارات مخفية.
 */
const props = withDefaults(defineProps<{ variant?: 'list' | 'ticker'; limit?: number }>(), {
  variant: 'list',
  limit: 5,
})

const TICK_MS = 7000
const CLOCK_MS = 30_000

const { t, locale } = useI18n()
const localName = useLocalName()
const { events } = useSaleEvents()

const now = ref(new Date())
const index = ref(0)
let clock: ReturnType<typeof setInterval> | null = null
let ticker: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clock = setInterval(() => { now.value = new Date() }, CLOCK_MS)
  if (props.variant === 'ticker') {
    ticker = setInterval(() => {
      const n = items.value.length
      index.value = n ? (index.value + 1) % n : 0
    }, TICK_MS)
  }
})
onBeforeUnmount(() => {
  if (clock) clearInterval(clock)
  if (ticker) clearInterval(ticker)
})

const items = computed(() => {
  void locale.value
  return events.value.slice(0, props.limit).map((e) => {
    const name = localName(e.name, e.name_ar)
    return {
      id: e.id,
      kind: e.kind,
      entity: { id: e.agent_id, name, photo: drivePhotoUrl(e.photo_url), deals: e.total_egp, target: 0, pct: 0 },
      text: e.kind === 'manual' ? t('notifications.manual', { name }) : t('notifications.sale', { name, amount: compact(e.amount_egp) }),
      team: e.team ? localName(e.team, e.team_ar) : '',
      when: relativeTime(new Date(e.created_at), now.value),
    }
  })
})

const current = computed(() => items.value[index.value % Math.max(items.value.length, 1)])
</script>

<template>
  <!-- سطر الكشك -->
  <div
    v-if="variant === 'ticker' && current"
    class="relative flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2"
    role="status"
    aria-live="polite"
  >
    <iconify-icon
      :icon="current.kind === 'manual' ? 'mdi:trophy' : 'mdi:cash-plus'"
      aria-hidden="true"
      class="shrink-0 text-lg lg:text-xl"
      :class="current.kind === 'manual' ? 'text-gold' : 'text-accent-live'"
    />
    <Transition name="ticker" mode="out-in">
      <span :key="current.id" class="flex min-w-0 items-baseline gap-2 text-white/90">
        <span class="truncate font-semibold text-sm lg:text-note">{{ current.text }}</span>
        <span class="shrink-0 text-white/50 text-caption">{{ current.when }}</span>
      </span>
    </Transition>
  </div>

  <!-- قائمة جانب المتصدّر -->
  <section
    v-else-if="variant === 'list' && items.length"
    class="flex flex-col rounded-xl border border-card-border bg-card shadow-[var(--shadow-card)] min-h-0 overflow-hidden"
    :aria-label="t('latest.title')"
  >
    <p class="m-0 flex items-center gap-2 border-b border-divider px-4 py-3 font-semibold text-strong text-sm lg:text-[clamp(14px,1.6vh,17px)]">
      <iconify-icon icon="mdi:lightning-bolt" aria-hidden="true" class="text-gold text-lg" />
      {{ t('latest.title') }}
    </p>
    <ul class="m-0 list-none p-0 overflow-hidden">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-3 border-b border-divider px-4 py-[clamp(6px,1.1vh,12px)] last:border-b-0"
      >
        <Avatar :entity="item.entity" kind="agent" class="size-9 lg:size-[clamp(32px,4.2vh,44px)] rounded-lg text-sm" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-semibold text-strong text-sm lg:text-[clamp(13px,1.55vh,16px)]">{{ item.text }}</span>
          <span class="truncate text-mute text-caption">
            <template v-if="item.team">{{ item.team }} · </template>{{ item.when }}
          </span>
        </div>
        <iconify-icon
          :icon="item.kind === 'manual' ? 'mdi:trophy' : 'mdi:cash-plus'"
          aria-hidden="true"
          class="shrink-0 text-lg"
          :class="item.kind === 'manual' ? 'text-gold' : 'text-accent-text'"
        />
      </li>
    </ul>
  </section>
</template>
