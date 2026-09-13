<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'

withDefaults(defineProps<{ title?: string; subtitle?: string }>(), {})

const { t } = useI18n()
const { busy, authError, signIn } = useAuth()

const email = ref('')
const password = ref('')

async function submit() {
  if (await signIn(email.value.trim(), password.value)) password.value = ''
}

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-6 bg-page px-5 font-sans">
    <img src="/logo.png" :alt="t('brand')" class="h-12 w-auto" draggable="false" />

    <form
      class="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]"
      @submit.prevent="submit"
    >
      <div class="flex flex-col gap-1">
        <h1 class="m-0 font-semibold text-strong text-lg">{{ title ?? t('lock.title') }}</h1>
        <p class="m-0 text-caption text-mute">{{ subtitle ?? t('lock.subtitle') }}</p>
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('admin.email') }}</span>
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          required
          dir="ltr"
          :class="FIELD"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="font-semibold text-caption text-mute">{{ t('admin.password') }}</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          dir="ltr"
          :class="FIELD"
        />
      </label>

      <p v-if="authError" role="alert" class="m-0 text-caption text-down">{{ authError }}</p>

      <button
        type="submit"
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        :disabled="busy"
      >{{ busy ? t('admin.signingIn') : t('admin.signIn') }}</button>

      <p class="m-0 text-eyebrow text-dim">{{ t('lock.staysSignedIn') }}</p>
    </form>
  </div>
</template>
