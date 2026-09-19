<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { relativeTime } from '@/lib/format'
import { useAuth } from '@/composables/useAuth'
import type { DeviceRow } from '@/lib/types'

/**
 * الأجهزة المتصلة بالبرنامج: كل شاشة بتسجّل نبضة كل دقيقة. المسؤول يقدر
 * يسمّي الجهاز أو يقطع اتصاله (خروج فوري + إلغاء جلسته).
 */
const ONLINE_MS = 3 * 60_000
const REFRESH_MS = 30_000

const { t, locale } = useI18n()
const { isDemo } = useAuth()

const devices = ref<DeviceRow[]>([])
const loading = ref(false)
const notice = ref<{ ok: boolean; text: string } | null>(null)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

/** معرّف الجهاز الحالي — يتعلّم عليه «هذا الجهاز» ولا يُقطع بالخطأ بدون تأكيد. */
const myId = (() => {
  try { return localStorage.getItem('everest.device-id') } catch { return null }
})()

async function load() {
  loading.value = true
  try {
    const { data, error } = await supabase.from('lb_devices').select('*').order('last_seen', { ascending: false })
    if (error) throw new Error(error.message)
    devices.value = (data ?? []) as DeviceRow[]
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => {
    now.value = Date.now()
    void load()
  }, REFRESH_MS)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

async function call(fn: string, id: string, extra: Record<string, unknown> = {}) {
  notice.value = null
  const { error } = await supabase.rpc(fn, { p_id: id, ...extra })
  if (error) {
    notice.value = { ok: false, text: error.message }
    return false
  }
  await load()
  return true
}

async function revoke(device: DeviceRow) {
  const name = label(device)
  const question = device.id === myId ? t('devices.confirmRevokeSelf') : t('devices.confirmRevoke', { name })
  if (!confirm(question)) return
  if (await call('lb_admin_revoke_device', device.id)) {
    notice.value = { ok: true, text: t('devices.revoked', { name }) }
  }
}

async function restore(device: DeviceRow) {
  if (await call('lb_admin_restore_device', device.id)) {
    notice.value = { ok: true, text: t('devices.restored', { name: label(device) }) }
  }
}

async function rename(device: DeviceRow) {
  const next = prompt(t('devices.renamePrompt'), device.label ?? '')
  if (next === null) return
  await call('lb_admin_rename_device', device.id, { p_label: next.slice(0, 60) })
}

async function remove(device: DeviceRow) {
  if (!confirm(t('devices.confirmDelete', { name: label(device) }))) return
  await call('lb_admin_delete_device', device.id)
}

const label = (d: DeviceRow) => d.label || t('devices.unknown')

/** «Chrome · Windows» من الـ user agent، للعرض تحت الاسم. */
function browserOf(ua: string | null) {
  if (!ua) return ''
  const browser =
    /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  const os =
    /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(' · ')
}

const VIEW_LABEL: Record<string, string> = { teams: 'view.teams', agents: 'view.agents', insights: 'view.insights', admin: 'admin.open' }

const rows = computed(() => {
  void locale.value
  return devices.value.map((d) => {
    const seen = new Date(d.last_seen).getTime()
    const online = !d.revoked_at && now.value - seen < ONLINE_MS
    return {
      device: d,
      name: label(d),
      browser: browserOf(d.user_agent),
      online,
      status: d.revoked_at
        ? { tone: 'text-down', text: t('devices.revokedStatus') }
        : online
          ? { tone: 'text-accent-text', text: t('devices.online') }
          : { tone: 'text-mute', text: t('devices.lastSeen', { when: relativeTime(new Date(seen), new Date(now.value)) }) },
      view: d.view && VIEW_LABEL[d.view] ? t(VIEW_LABEL[d.view]) : '',
      isMe: d.id === myId,
    }
  })
})

const onlineCount = computed(() => rows.value.filter((r) => r.online).length)
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">
          {{ t('devices.title') }}
          <span class="font-medium text-mute text-sm">({{ t('devices.onlineCount', { n: onlineCount }) }})</span>
        </h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('devices.hint') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
        :disabled="loading"
        @click="load"
      >
        <iconify-icon icon="mdi:refresh" aria-hidden="true" :class="loading ? 'animate-spin' : ''" />
        {{ t('admin.storage.refresh') }}
      </button>
    </header>

    <p
      v-if="notice"
      :role="notice.ok ? 'status' : 'alert'"
      class="m-0 rounded-lg px-4 py-2.5 text-sm font-medium"
      :class="notice.ok ? 'bg-accent/[0.08] text-accent-text' : 'bg-down/10 text-down'"
    >{{ notice.text }}</p>

    <p v-if="isDemo" class="m-0 text-caption text-dim">{{ t('devices.demoHint') }}</p>

    <p v-if="!rows.length && !loading" class="m-0 rounded-xl border border-dashed border-card-border px-4 py-10 text-center text-mute">
      {{ t('devices.empty') }}
    </p>

    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="r in rows"
        :key="r.device.id"
        class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
        :class="r.device.revoked_at ? 'border-down/40 opacity-70' : r.online ? 'border-accent/40' : 'border-card-border'"
      >
        <span
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-xl"
          :class="r.online ? 'bg-accent/12 text-accent-text' : 'bg-page text-mute'"
          aria-hidden="true"
        >
          <iconify-icon :icon="r.device.kiosk ? 'mdi:television' : 'mdi:monitor'" />
        </span>

        <div class="flex min-w-0 flex-1 flex-col">
          <p class="m-0 flex flex-wrap items-center gap-2 font-semibold text-strong">
            <span class="truncate">{{ r.name }}</span>
            <span v-if="r.isMe" class="rounded-full bg-accent/12 px-2 py-0.5 text-caption font-semibold text-accent-text">
              {{ t('devices.thisDevice') }}
            </span>
            <span v-if="r.device.kiosk" class="rounded-full bg-gold/15 px-2 py-0.5 text-caption font-semibold text-gold">
              {{ t('devices.kiosk') }}
            </span>
          </p>
          <p class="m-0 truncate text-caption text-mute">
            <template v-if="r.browser">{{ r.browser }} · </template>
            <template v-if="r.device.screen">{{ r.device.screen }} · </template>
            <span dir="ltr">{{ r.device.user_email }}</span>
            <template v-if="r.view"> · {{ r.view }}</template>
          </p>
          <p class="m-0 text-caption font-semibold" :class="r.status.tone">
            <span v-if="r.online" aria-hidden="true" class="me-1 inline-block size-2 rounded-full bg-accent-live align-middle animate-pulse-dot" />
            {{ r.status.text }}
          </p>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong"
            :title="t('devices.rename')"
            :disabled="isDemo"
            @click="rename(r.device)"
          >
            <iconify-icon icon="mdi:rename-outline" aria-hidden="true" />
          </button>
          <button
            v-if="!r.device.revoked_at"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-down/50 px-3 py-1.5 text-caption font-semibold text-down transition-colors hover:bg-down/10 disabled:opacity-50"
            :disabled="isDemo"
            @click="revoke(r.device)"
          >
            <iconify-icon icon="mdi:lan-disconnect" aria-hidden="true" />
            {{ t('devices.revoke') }}
          </button>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-accent-text disabled:opacity-50"
            :disabled="isDemo"
            @click="restore(r.device)"
          >
            <iconify-icon icon="mdi:lan-connect" aria-hidden="true" />
            {{ t('devices.restore') }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-down disabled:opacity-50"
            :aria-label="t('admin.delete')"
            :disabled="isDemo"
            @click="remove(r.device)"
          >
            <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
