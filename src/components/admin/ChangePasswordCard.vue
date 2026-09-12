<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { checkPwnedPassword } from '@/lib/pwnedPassword'

const { t } = useI18n()
const { changePassword } = useAuth()

const newPassword = ref('')
const confirmPassword = ref('')
const checking = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref(false)
const allowLeakedCheckFailure = ref(false)

async function submit() {
  error.value = null
  success.value = false

  if (newPassword.value.length < 6) {
    error.value = t('admin.passwordTooShort')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = t('admin.passwordMismatch')
    return
  }

  if (!allowLeakedCheckFailure.value) {
    checking.value = true
    const result = await checkPwnedPassword(newPassword.value)
    checking.value = false

    if (result.checked && result.pwned) {
      error.value = t('admin.passwordPwned', { count: result.count })
      return
    }
    if (!result.checked) {
      error.value = t('admin.passwordCheckFailed')
      allowLeakedCheckFailure.value = true
      return
    }
  }
  allowLeakedCheckFailure.value = false

  saving.value = true
  try {
    const message = await changePassword(newPassword.value)
    if (message) {
      error.value = message
      return
    }
    success.value = true
    newPassword.value = ''
    confirmPassword.value = ''
  } finally {
    saving.value = false
  }
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <form
    class="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]"
    @submit.prevent="submit"
  >
    <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.changePassword') }}</h2>
    <p class="m-0 text-caption text-mute">{{ t('admin.changePasswordHint') }}</p>

    <label class="flex flex-col gap-1.5">
      <span class="font-semibold text-caption text-mute">{{ t('admin.newPassword') }}</span>
      <input
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        required
        dir="ltr"
        :class="FIELD"
      />
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="font-semibold text-caption text-mute">{{ t('admin.confirmPassword') }}</span>
      <input
        v-model="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
        dir="ltr"
        :class="FIELD"
      />
    </label>

    <p v-if="error" role="alert" class="m-0 text-caption text-down">{{ error }}</p>
    <p v-if="success" role="status" class="m-0 text-caption text-accent-text">{{ t('admin.passwordChanged') }}</p>

    <button
      type="submit"
      class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      :disabled="checking || saving"
    >{{
      checking ? t('admin.checkingLeak')
      : saving ? t('admin.saving')
      : allowLeakedCheckFailure ? t('admin.continueAnyway')
      : t('admin.changePassword')
    }}</button>
  </form>
</template>
