<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import BrandLogo from './BrandLogo.vue'

withDefaults(defineProps<{ title?: string; subtitle?: string }>(), {})

const { t } = useI18n()
const { busy, authError, signIn } = useAuth()

const email = ref('')
const password = ref('')
const showPassword = ref(false)

async function submit() {
  if (await signIn(email.value.trim(), password.value)) password.value = ''
}

const FIELD =
  'w-full min-h-12 rounded-xl border border-card-border bg-page px-3.5 py-2.5 text-base text-strong placeholder:text-dim transition-[border-color,box-shadow] duration-200 hover:border-accent/40 focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 aria-[invalid=true]:border-down'
</script>

<template>
  <div class="min-h-screen grid bg-page font-sans lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <!-- لوحة الهوية: على الشاشات العريضة فقط؛ على الموبايل الشعار فوق النموذج -->
    <aside
      data-surface="dark"
      class="on-brand relative isolate hidden overflow-hidden lg:flex flex-col justify-between p-[clamp(32px,5vw,72px)]"
    >
      <span class="peaks -z-10 !w-[70%] !opacity-[0.09]" aria-hidden="true" />
      <BrandLogo tone="white" class="h-[clamp(56px,8vh,88px)] self-start rise" />
      <div class="flex flex-col gap-4 rise" style="--i: 2">
        <p class="m-0 font-extrabold leading-[1.15] text-balance text-[clamp(32px,4.4vw,60px)]">{{ t('lock.headline') }}</p>
        <p class="m-0 max-w-[36ch] font-medium text-mute text-lg">{{ t('lock.tagline') }}</p>
      </div>
      <span class="h-1 w-24 rounded-full bg-[linear-gradient(90deg,var(--color-gold),var(--color-accent))]" aria-hidden="true" />
    </aside>

    <main class="flex flex-col items-center justify-center gap-7 px-5 py-10">
      <BrandLogo class="h-14 lg:hidden" />

      <form
        class="rise flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-card-border bg-card p-6 sm:p-7 shadow-[var(--shadow-panel)]"
        style="--i: 1"
        :aria-busy="busy"
        @submit.prevent="submit"
      >
        <div class="flex flex-col gap-1.5">
          <h1 class="m-0 font-extrabold text-strong text-2xl">{{ title ?? t('lock.title') }}</h1>
          <p class="m-0 text-note text-mute">{{ subtitle ?? t('lock.subtitle') }}</p>
        </div>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.identifier') }}</span>
          <input
            v-model="email"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            required
            dir="ltr"
            :aria-invalid="authError ? 'true' : undefined"
            :aria-describedby="authError ? 'signin-error' : undefined"
            :class="FIELD"
          />
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.password') }}</span>
          <span class="relative block">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              dir="ltr"
              :aria-invalid="authError ? 'true' : undefined"
              :aria-describedby="authError ? 'signin-error' : undefined"
              :class="[FIELD, 'pe-12']"
            />
            <button
              type="button"
              class="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-xl text-mute transition-colors hover:text-strong"
              :aria-label="showPassword ? t('lock.hidePassword') : t('lock.showPassword')"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <iconify-icon :icon="showPassword ? 'mdi:eye-off-outline' : 'mdi:eye-outline'" aria-hidden="true" class="text-xl" />
            </button>
          </span>
        </label>

        <p
          v-if="authError"
          id="signin-error"
          role="alert"
          class="m-0 flex items-start gap-2 rounded-xl bg-down/10 px-3 py-2.5 text-caption font-semibold text-down"
        >
          <iconify-icon icon="mdi:alert-circle-outline" aria-hidden="true" class="mt-0.5 shrink-0 text-base" />
          {{ authError }}
        </p>

        <button
          type="submit"
          class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-base font-bold text-white shadow-[0_10px_20px_-12px_var(--color-accent)] transition-colors duration-200 hover:bg-accent-strong disabled:opacity-60"
          :disabled="busy"
        >
          <iconify-icon v-if="busy" icon="mdi:loading" aria-hidden="true" class="animate-spin text-lg" />
          {{ busy ? t('admin.signingIn') : t('admin.signIn') }}
        </button>

        <p class="m-0 text-caption text-dim">{{ t('lock.staysSignedIn') }}</p>
      </form>
    </main>
  </div>
</template>
