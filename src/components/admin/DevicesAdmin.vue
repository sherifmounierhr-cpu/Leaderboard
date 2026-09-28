<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { relativeTime } from '@/lib/format'
import { useAuth } from '@/composables/useAuth'
import { useBoardMedia } from '@/composables/useBoardMedia'
import type { DeviceRow } from '@/lib/types'

/**
 * الأجهزة المتصلة بالبرنامج: كل شاشة بتسجّل نبضة كل دقيقة. المسؤول يقدر
 * يسمّي الجهاز أو يقطع اتصاله (خروج فوري + إلغاء جلسته).
 */
const ONLINE_MS = 3 * 60_000
const REFRESH_MS = 30_000

const { t, locale } = useI18n()
const { isDemo } = useAuth()
const { settings } = useBoardMedia()

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

/*
 * المتابعة على الشاشات اللي تستاهل بس. لو التنبيه على كل جهاز، هيوصل إيميل
 * مع كل تبويب بيتقفل، والإيميل ده بيتجاهل من تاني يوم.
 */
async function toggleWatch(device: DeviceRow) {
  const next = !device.watch
  if (await call('lb_admin_set_device_watch', device.id, { p_watch: next })) {
    notice.value = {
      ok: true,
      text: t(next ? 'devices.watchOn' : 'devices.watchOff', { name: label(device) }),
    }
  }
}

// ------------------------------------------------------- إعدادات التنبيه
const alertForm = ref({ enabled: true, email: '', afterMin: 15 })
const savingAlerts = ref(false)

/*
 * immediate: الإعدادات بتتحمّل مرة واحدة وممكن تكون جاهزة قبل ما المكوّن
 * يركّب، فالمراقبة العادية بتفوتها والنموذج يفضل فاضي.
 */
watch(settings, (s) => {
  alertForm.value = {
    enabled: s.alerts_enabled !== false,
    email: s.alert_email ?? '',
    afterMin: s.alert_after_min ?? 15,
  }
}, { immediate: true, deep: true })

const watchedCount = computed(() => devices.value.filter((d) => d.watch && !d.revoked_at).length)

async function saveAlerts() {
  savingAlerts.value = true
  notice.value = null
  try {
    const { error } = await supabase.rpc('lb_admin_save_alert_settings', {
      p_enabled: alertForm.value.enabled,
      p_email: alertForm.value.email.trim() || null,
      p_after_min: alertForm.value.afterMin,
    })
    if (error) throw new Error(error.message)
    notice.value = { ok: true, text: t('devices.alertsSaved') }
    await load()
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    savingAlerts.value = false
  }
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
      watched: d.watch && !d.revoked_at,
      // اتبعت عنها إيميل ولسه ساكتة
      alerted: Boolean(d.alerted_at) && !d.revoked_at,
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

    <!-- إيميل لما شاشة متابَعة تسكت -->
    <form
      class="flex flex-col gap-3 rounded-xl border border-card-border bg-card px-4 py-4"
      @submit.prevent="saveAlerts"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="m-0 flex items-center gap-2 font-semibold text-strong">
          <iconify-icon icon="mdi:email-alert-outline" aria-hidden="true" class="text-accent-text" />
          {{ t('devices.alertsTitle') }}
        </h3>
        <span class="text-caption text-mute">{{ t('devices.watchedCount', { n: watchedCount }) }}</span>
      </div>

      <p class="m-0 text-caption text-mute">{{ t('devices.alertsHint') }}</p>

      <label class="flex w-fit items-center gap-2 text-sm font-medium text-strong">
        <input v-model="alertForm.enabled" type="checkbox" :disabled="isDemo" class="size-4 accent-[var(--color-accent)]" />
        {{ t('devices.alertsEnabled') }}
      </label>

      <div class="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label class="flex flex-col gap-1.5 text-caption font-semibold text-mute">
          {{ t('devices.alertEmail') }}
          <input
            v-model="alertForm.email"
            type="email"
            dir="ltr"
            inputmode="email"
            :placeholder="t('devices.alertEmailPlaceholder')"
            :disabled="isDemo"
            class="rounded-lg border border-card-border bg-page px-3 py-2 text-sm font-medium text-strong"
          />
        </label>

        <label class="flex flex-col gap-1.5 text-caption font-semibold text-mute">
          {{ t('devices.alertAfter') }}
          <input
            v-model.number="alertForm.afterMin"
            type="number"
            min="5"
            max="240"
            step="5"
            :disabled="isDemo"
            class="rounded-lg border border-card-border bg-page px-3 py-2 text-sm font-medium text-strong"
          />
        </label>

        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          :disabled="isDemo || savingAlerts"
        >{{ savingAlerts ? t('admin.saving') : t('admin.save') }}</button>
      </div>
    </form>

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
            <span
              v-if="r.watched"
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
              :class="r.alerted ? 'bg-down/12 text-down' : 'bg-accent/12 text-accent-text'"
            >
              <iconify-icon :icon="r.alerted ? 'mdi:bell-alert' : 'mdi:bell-ring-outline'" aria-hidden="true" />
              {{ r.alerted ? t('devices.alertSent') : t('devices.watched') }}
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
            class="rounded-lg border px-2.5 py-1.5 text-caption font-semibold transition-colors disabled:opacity-50"
            :class="r.watched
              ? 'border-accent/50 bg-accent/10 text-accent-text'
              : 'border-card-border text-mute hover:text-strong'"
            :title="t(r.watched ? 'devices.watchOffAction' : 'devices.watchOnAction')"
            :aria-pressed="r.watched"
            :disabled="isDemo || Boolean(r.device.revoked_at)"
            @click="toggleWatch(r.device)"
          >
            <iconify-icon :icon="r.watched ? 'mdi:bell-ring' : 'mdi:bell-outline'" aria-hidden="true" />
          </button>
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
