<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { compact, drivePhotoUrl, egp, relativeTime } from '@/lib/format'
import { useSaleEvents } from '@/composables/useSaleEvents'
import { useLocalName } from '@/composables/useLocalName'
import type { SaleEventRow } from '@/lib/types'
import Avatar from './Avatar.vue'

/** يُحدَّث «منذ كم» كل نصف دقيقة — أدق من ذلك لا يلزم. */
const CLOCK_MS = 30_000

const { t, locale } = useI18n()
const localName = useLocalName()
const { events, unreadCount, markAllRead, replay } = useSaleEvents()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

function toggle() {
  open.value = !open.value
  // فتح القائمة يعني أن الإشعارات قُرئت
  if (open.value) markAllRead()
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
  timer = setInterval(() => { now.value = new Date() }, CLOCK_MS)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  if (timer) clearInterval(timer)
})

const items = computed(() => {
  void locale.value
  return events.value.map((e: SaleEventRow) => {
    const name = localName(e.name, e.name_ar)
    return {
      event: e,
      entity: {
        id: e.agent_id,
        name,
        photo: drivePhotoUrl(e.photo_url),
        deals: e.total_egp,
        target: 0,
        pct: 0,
      },
      text:
        e.kind === 'manual'
          ? t('notifications.manual', { name })
          : t('notifications.sale', { name, amount: compact(e.amount_egp) }),
      when: relativeTime(new Date(e.created_at), now.value),
      title: new Date(e.created_at).toLocaleString(),
    }
  })
})

const badge = computed(() => (unreadCount.value > 9 ? '9+' : String(unreadCount.value)))
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="relative inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/75 hover:text-white size-11 lg:size-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-live focus-visible:ring-offset-2 focus-visible:ring-offset-header"
      :aria-label="unreadCount ? t('notifications.openUnread', { n: unreadCount }) : t('notifications.open')"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <iconify-icon
        :icon="unreadCount ? 'mdi:bell-ring-outline' : 'mdi:bell-outline'"
        aria-hidden="true"
        class="text-xl"
      />
      <span
        v-if="unreadCount"
        aria-hidden="true"
        class="absolute -top-1.5 -end-1.5 min-w-5 h-5 px-1 rounded-full bg-gold text-header text-[11px] font-bold leading-5 tabular-nums text-center ring-2 ring-header"
      >{{ badge }}</span>
    </button>

    <div
      v-if="open"
      role="dialog"
      :aria-label="t('notifications.title')"
      class="max-sm:fixed max-sm:inset-x-3 max-sm:top-16 sm:absolute sm:end-0 sm:top-[calc(100%+8px)] sm:w-88 z-50 flex max-h-[min(70vh,560px)] flex-col rounded-xl border border-card-border bg-card text-strong shadow-[var(--shadow-panel)]"
    >
      <p class="m-0 border-b border-divider px-4 py-3 font-semibold text-sm">
        {{ t('notifications.title') }}
      </p>

      <div v-if="!items.length" class="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <iconify-icon icon="mdi:bell-sleep-outline" aria-hidden="true" class="text-dim text-4xl" />
        <p class="m-0 text-mute text-sm">{{ t('notifications.empty') }}</p>
      </div>

      <ul v-else class="m-0 list-none overflow-y-auto p-1.5">
        <li
          v-for="item in items"
          :key="item.event.id"
          class="flex items-start gap-3 rounded-lg px-2.5 py-2.5 hover:bg-page"
        >
          <Avatar :entity="item.entity" kind="agent" class="size-10 shrink-0 rounded-xl text-sm" />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="m-0 text-sm leading-snug">
              <iconify-icon
                :icon="item.event.kind === 'manual' ? 'mdi:trophy' : 'mdi:cash-plus'"
                aria-hidden="true"
                class="me-1 align-[-2px]"
                :class="item.event.kind === 'manual' ? 'text-gold' : 'text-accent-text'"
              />
              <span :title="item.event.kind === 'sale' ? egp(item.event.amount_egp) : undefined">{{ item.text }}</span>
            </p>
            <p v-if="item.event.note" class="m-0 break-words text-caption text-mute">“{{ item.event.note }}”</p>
            <time class="text-eyebrow text-dim" :datetime="item.event.created_at" :title="item.title">
              {{ item.when }}
            </time>
          </div>
          <button
            type="button"
            class="shrink-0 inline-flex size-9 items-center justify-center rounded-lg text-mute transition-colors hover:bg-accent/10 hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            :aria-label="t('notifications.replay')"
            :title="t('notifications.replay')"
            @click="replay(item.event); open = false"
          >
            <iconify-icon icon="mdi:party-popper" aria-hidden="true" class="text-lg" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
