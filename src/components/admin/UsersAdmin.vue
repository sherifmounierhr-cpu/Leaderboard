<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { relativeTime } from '@/lib/format'
import { checkPwnedPassword } from '@/lib/pwnedPassword'
import { useAuth } from '@/composables/useAuth'
import { ADMIN_TABS, tabLabelKey, type AdminSection } from '@/lib/adminTabs'

/**
 * مستخدمو صفحة الإدارة. القراءة وتحديد الصلاحيات عبر دوال القاعدة المحروسة؛
 * الإنشاء والحذف وكلمة المرور عبر دالة الحافة admin-users (تحتاج service_role).
 * الواجهة هنا للراحة فقط — كل قاعدة تُفرض على الخادم.
 */
type Role = 'admin' | 'editor' | 'readonly' | 'viewer' | 'demo'

interface UserRow {
  id: string
  /** null = حساب بلا بريد حقيقي (يدخل باسمه فقط). */
  email: string | null
  username: string | null
  role: Role
  permissions: AdminSection[]
  created_at: string
  last_sign_in_at: string | null
  banned: boolean
}

const MIN_PASSWORD = 10
/** نفس قيد القاعدة: 3–30، حروف إنجليزية صغيرة وأرقام و . _ - */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
const ROLES: Exclude<Role, 'demo'>[] = ['admin', 'editor', 'readonly', 'viewer']

const { t, locale } = useI18n()
const { session } = useAuth()
const myId = computed(() => session.value?.user.id ?? null)

const users = ref<UserRow[]>([])
const loading = ref(false)
const busy = ref(false)
const notice = ref<{ ok: boolean; text: string } | null>(null)

/** null = مغلق؛ id فاضي = مستخدم جديد. accessLocked: حسابك أو حساب العرض — الاسم فقط. */
const editing = ref<{ id: string; name: string; username: string; accessLocked: boolean } | null>(null)
const form = ref({
  email: '',
  username: '',
  password: '',
  role: 'editor' as Exclude<Role, 'demo'>,
  permissions: [] as AdminSection[],
})

const displayName = (u: UserRow) => u.username ?? u.email ?? '—'
const shownPassword = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    const { data, error } = await supabase.rpc('lb_admin_list_users')
    if (error) throw new Error(error.message)
    users.value = (data ?? []) as UserRow[]
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** رسالة الخطأ من دالة الحافة — supabase-js يخفيها داخل context. */
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let message = error.message
    try {
      const payload = await (error as { context?: Response }).context?.json()
      if (payload?.error) message = payload.error
    } catch { /* الرسالة العامة تكفي */ }
    throw new Error(message)
  }
  return data as { ok: boolean; id?: string }
}

async function run(task: () => Promise<unknown>, okText: string) {
  busy.value = true
  notice.value = null
  try {
    await task()
    notice.value = { ok: true, text: okText }
    await load()
    return true
  } catch (err) {
    notice.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
    return false
  } finally {
    busy.value = false
  }
}

/** كلمة مرور عشوائية قوية — بلا حروف متشابهة (0/O، 1/l). */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*-_'
  const bytes = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(bytes, (n) => chars[n % chars.length]).join('')
}

/** نفس فحص «تغيير كلمة المرور»: طول + قاعدة التسريبات. */
async function passwordProblem(password: string) {
  if (password.length < MIN_PASSWORD) return t('users.passwordTooShort', { n: MIN_PASSWORD })
  const result = await checkPwnedPassword(password)
  if (result.checked && result.pwned) return t('admin.passwordPwned', { count: result.count })
  return null
}

function openNew() {
  editing.value = { id: '', name: '', username: '', accessLocked: false }
  form.value = { email: '', username: '', password: generatePassword(), role: 'editor', permissions: [] }
  shownPassword.value = null
  notice.value = null
}

function openEdit(u: UserRow) {
  editing.value = {
    id: u.id,
    name: displayName(u),
    username: u.username ?? '',
    accessLocked: u.id === myId.value || u.role === 'demo',
  }
  form.value = {
    email: u.email ?? '',
    username: u.username ?? '',
    password: '',
    role: u.role === 'demo' ? 'readonly' : u.role,
    permissions: u.role === 'editor' ? [...u.permissions] : [],
  }
  shownPassword.value = null
  notice.value = null
}

function togglePerm(p: AdminSection) {
  const list = form.value.permissions
  form.value.permissions = list.includes(p) ? list.filter((x) => x !== p) : [...list, p]
}

const formError = computed(() => {
  const username = form.value.username.trim().toLowerCase()
  if (username && !USERNAME_RE.test(username)) return t('users.usernameRule')
  if (editing.value && !editing.value.id && !username && !form.value.email.trim()) return t('users.needOne')
  if (!editing.value?.accessLocked && form.value.role === 'editor' && !form.value.permissions.length) {
    return t('users.pickOne')
  }
  return null
})

async function save() {
  if (!editing.value || formError.value) return
  const perms = form.value.role === 'editor' ? form.value.permissions : []
  const username = form.value.username.trim().toLowerCase()

  if (!editing.value.id) {
    const email = form.value.email.trim().toLowerCase()
    const password = form.value.password
    const name = username || email
    busy.value = true
    const problem = await passwordProblem(password)
    busy.value = false
    if (problem) {
      notice.value = { ok: false, text: problem }
      return
    }
    const ok = await run(
      () => invoke({ action: 'create', email, username, password, role: form.value.role, permissions: perms }),
      t('users.created', { email: name }),
    )
    if (ok) {
      // تظهر مرة واحدة ليسلّمها المسؤول لصاحب الحساب
      shownPassword.value = password
      editing.value = null
    }
    return
  }

  const target = editing.value
  const ok = await run(async () => {
    if (username !== target.username) {
      const { error } = await supabase.rpc('lb_admin_set_username', { p_user_id: target.id, p_username: username })
      if (error) throw new Error(error.message)
    }
    if (target.accessLocked) return
    const { error } = await supabase.rpc('lb_admin_set_access', {
      p_user_id: target.id,
      p_role: form.value.role,
      p_permissions: perms,
    })
    if (error) throw new Error(error.message)
  }, t('users.saved', { email: username || target.name }))
  if (ok) editing.value = null
}

async function resetPassword(u: UserRow) {
  const email = displayName(u)
  if (!confirm(t('users.confirmReset', { email }))) return
  const password = generatePassword()
  const ok = await run(() => invoke({ action: 'password', user_id: u.id, password }), t('users.passwordReset', { email }))
  if (ok) shownPassword.value = password
}

async function toggleBan(u: UserRow) {
  const email = displayName(u)
  if (!u.banned && !confirm(t('users.confirmBan', { email }))) return
  await run(
    () => invoke({ action: 'ban', user_id: u.id, banned: !u.banned }),
    t(u.banned ? 'users.unbanned' : 'users.banned', { email }),
  )
}

async function remove(u: UserRow) {
  const email = displayName(u)
  if (!confirm(t('users.confirmDelete', { email }))) return
  await run(() => invoke({ action: 'delete', user_id: u.id }), t('users.deleted', { email }))
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notice.value = { ok: true, text: t('users.copied') }
  } catch { /* النص ظاهر للنسخ اليدوي */ }
}

const ROLE_TONE: Record<Role, string> = {
  admin: 'bg-accent/12 text-accent-text',
  editor: 'bg-gold/15 text-gold',
  readonly: 'bg-page text-mute border border-card-border',
  demo: 'bg-page text-mute border border-card-border',
  viewer: 'bg-page text-dim border border-card-border',
}

const rows = computed(() => {
  void locale.value
  const now = new Date()
  return users.value.map((u) => ({
    user: u,
    isMe: u.id === myId.value,
    lastSeen: u.last_sign_in_at ? relativeTime(new Date(u.last_sign_in_at), now) : t('users.never'),
  }))
})

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const ICON_BTN =
  'rounded-lg border border-card-border px-2.5 py-1.5 text-caption font-semibold text-mute transition-colors hover:text-strong disabled:opacity-40'
</script>

<template>
  <section class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="m-0 font-semibold text-strong text-lg">
          {{ t('users.title') }}
          <span class="font-medium text-mute text-sm">({{ users.length }})</span>
        </h2>
        <p class="m-0 mt-1 text-caption text-mute">{{ t('users.hint') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-strong disabled:opacity-50"
          :disabled="loading"
          @click="load"
        >
          <iconify-icon icon="mdi:refresh" aria-hidden="true" :class="loading ? 'animate-spin' : ''" />
          {{ t('admin.storage.refresh') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy"
          @click="openNew"
        >
          <iconify-icon icon="mdi:account-plus-outline" aria-hidden="true" />
          {{ t('users.add') }}
        </button>
      </div>
    </header>

    <p
      v-if="notice"
      :role="notice.ok ? 'status' : 'alert'"
      class="m-0 rounded-lg px-4 py-2.5 text-sm font-medium"
      :class="notice.ok ? 'bg-accent/[0.08] text-accent-text' : 'bg-down/10 text-down'"
    >{{ notice.text }}</p>

    <!-- كلمة المرور الجديدة: تظهر مرة واحدة فقط -->
    <div
      v-if="shownPassword"
      role="status"
      class="flex flex-wrap items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3"
    >
      <iconify-icon icon="mdi:key-outline" aria-hidden="true" class="shrink-0 text-gold text-xl" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <p class="m-0 text-sm font-semibold text-strong">{{ t('users.passwordOnce') }}</p>
        <code dir="ltr" class="select-all break-all font-mono text-sm text-strong">{{ shownPassword }}</code>
      </div>
      <button type="button" :class="ICON_BTN" @click="copy(shownPassword)">
        <iconify-icon icon="mdi:content-copy" aria-hidden="true" /> {{ t('users.copy') }}
      </button>
      <button type="button" :class="ICON_BTN" :aria-label="t('admin.cancel')" @click="shownPassword = null">
        <iconify-icon icon="mdi:close" aria-hidden="true" />
      </button>
    </div>

    <!-- إنشاء / تعديل -->
    <form
      v-if="editing"
      class="flex flex-col gap-4 rounded-xl border border-card-border bg-card p-5 shadow-[var(--shadow-panel)]"
      @submit.prevent="save"
    >
      <h3 class="m-0 font-semibold text-strong">
        {{ editing.id ? t('users.editTitle', { email: editing.name }) : t('users.add') }}
      </h3>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('users.username') }}</span>
          <input
            v-model="form.username"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="30"
            dir="ltr"
            placeholder="ahmed.sales"
            :class="FIELD"
          />
          <span class="text-caption text-dim">{{ t('users.usernameHint') }}</span>
        </label>
        <label v-if="!editing.id" class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('users.emailOptional') }}</span>
          <input v-model="form.email" type="email" autocomplete="off" dir="ltr" :class="FIELD" />
          <span class="text-caption text-dim">{{ t('users.emailHint') }}</span>
        </label>
        <label v-if="!editing.id" class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.password') }}</span>
          <div class="flex gap-2">
            <input
              v-model="form.password"
              type="text"
              required
              :minlength="MIN_PASSWORD"
              autocomplete="new-password"
              spellcheck="false"
              dir="ltr"
              :class="[FIELD, 'font-mono']"
            />
            <button
              type="button"
              :class="ICON_BTN"
              :title="t('users.generate')"
              :aria-label="t('users.generate')"
              @click="form.password = generatePassword()"
            >
              <iconify-icon icon="mdi:dice-multiple-outline" aria-hidden="true" />
            </button>
          </div>
          <span class="text-caption text-dim">{{ t('users.passwordHint', { n: MIN_PASSWORD }) }}</span>
        </label>
      </div>

      <p v-if="editing.accessLocked" class="m-0 text-caption text-dim">{{ t('users.accessLocked') }}</p>

      <fieldset v-if="!editing.accessLocked" class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="mb-2 font-semibold text-caption text-mute">{{ t('users.role') }}</legend>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label
            v-for="r in ROLES"
            :key="r"
            class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors"
            :class="form.role === r ? 'border-accent bg-accent/[0.06]' : 'border-card-border hover:border-mute'"
          >
            <input v-model="form.role" type="radio" name="role" :value="r" class="mt-1 accent-[var(--color-accent)]" />
            <span class="flex flex-col">
              <span class="text-sm font-semibold text-strong">{{ t(`users.roles.${r}`) }}</span>
              <span class="text-caption text-mute leading-snug">{{ t(`users.roleHints.${r}`) }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset v-if="form.role === 'editor' && !editing.accessLocked" class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="mb-2 font-semibold text-caption text-mute">{{ t('users.sections') }}</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in ADMIN_TABS"
            :key="p"
            type="button"
            role="checkbox"
            :aria-checked="form.permissions.includes(p)"
            class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-caption font-semibold transition-colors"
            :class="form.permissions.includes(p) ? 'border-accent bg-accent text-white' : 'border-card-border text-mute hover:text-strong'"
            @click="togglePerm(p)"
          >
            <iconify-icon :icon="form.permissions.includes(p) ? 'mdi:check' : 'mdi:plus'" aria-hidden="true" />
            {{ t(tabLabelKey(p)) }}
          </button>
        </div>
      </fieldset>

      <p v-if="formError" class="m-0 text-caption text-down">{{ formError }}</p>

      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          :disabled="busy || !!formError"
        >{{ busy ? t('admin.saving') : editing.id ? t('admin.save') : t('users.create') }}</button>
        <button
          type="button"
          class="rounded-lg border border-card-border px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-strong"
          @click="editing = null"
        >{{ t('admin.cancel') }}</button>
      </div>
    </form>

    <!-- القائمة -->
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="r in rows"
        :key="r.user.id"
        class="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
        :class="r.user.banned ? 'border-down/40 opacity-70' : 'border-card-border'"
      >
        <span
          class="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-page text-xl text-mute"
          aria-hidden="true"
        >
          <iconify-icon :icon="r.user.role === 'admin' ? 'mdi:shield-account-outline' : 'mdi:account-outline'" />
        </span>

        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <p class="m-0 flex flex-wrap items-center gap-2 font-semibold text-strong">
            <span dir="ltr" class="truncate">{{ r.user.username ?? r.user.email }}</span>
            <span class="rounded-full px-2 py-0.5 text-caption font-semibold" :class="ROLE_TONE[r.user.role]">
              {{ t(`users.roles.${r.user.role}`) }}
            </span>
            <span v-if="r.isMe" class="rounded-full bg-accent/12 px-2 py-0.5 text-caption font-semibold text-accent-text">
              {{ t('users.you') }}
            </span>
            <span v-if="r.user.banned" class="rounded-full bg-down/10 px-2 py-0.5 text-caption font-semibold text-down">
              {{ t('users.bannedBadge') }}
            </span>
          </p>
          <p v-if="r.user.role === 'editor'" class="m-0 flex flex-wrap gap-1">
            <span
              v-for="p in r.user.permissions"
              :key="p"
              class="rounded-md border border-card-border px-1.5 py-0.5 text-caption text-mute"
            >{{ t(tabLabelKey(p)) }}</span>
          </p>
          <p class="m-0 text-caption text-dim">
            <template v-if="r.user.username">
              <span dir="ltr">{{ r.user.email ?? t('users.noEmail') }}</span> ·
            </template>
            {{ t('users.lastSignIn', { when: r.lastSeen }) }}
          </p>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            :class="ICON_BTN"
            :title="t('users.editAccess')"
            :aria-label="t('users.editAccess')"
            :disabled="busy"
            @click="openEdit(r.user)"
          >
            <iconify-icon icon="mdi:shield-edit-outline" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="ICON_BTN"
            :title="t('users.resetPassword')"
            :aria-label="t('users.resetPassword')"
            :disabled="busy || r.isMe"
            @click="resetPassword(r.user)"
          >
            <iconify-icon icon="mdi:lock-reset" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="ICON_BTN"
            :title="t(r.user.banned ? 'users.unban' : 'users.ban')"
            :aria-label="t(r.user.banned ? 'users.unban' : 'users.ban')"
            :disabled="busy || r.isMe"
            @click="toggleBan(r.user)"
          >
            <iconify-icon :icon="r.user.banned ? 'mdi:account-check-outline' : 'mdi:account-cancel-outline'" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="[ICON_BTN, 'hover:!text-down']"
            :title="t('admin.delete')"
            :aria-label="t('admin.delete')"
            :disabled="busy || r.isMe"
            @click="remove(r.user)"
          >
            <iconify-icon icon="mdi:trash-can-outline" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
