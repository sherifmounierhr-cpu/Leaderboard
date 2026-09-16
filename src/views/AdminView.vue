<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useAdminData } from '@/composables/useAdminData'
import TeamsAdmin from '@/components/admin/TeamsAdmin.vue'
import AgentsAdmin from '@/components/admin/AgentsAdmin.vue'
import PeriodsAdmin from '@/components/admin/PeriodsAdmin.vue'
import ChangePasswordCard from '@/components/admin/ChangePasswordCard.vue'
import ReportsAdmin from '@/components/admin/ReportsAdmin.vue'
import DataTransfer from '@/components/admin/DataTransfer.vue'
import CelebrateAdmin from '@/components/admin/CelebrateAdmin.vue'
import StorageAdmin from '@/components/admin/StorageAdmin.vue'
import { useStorageHealth } from '@/composables/useStorageHealth'

const { t } = useI18n()
const { ready, busy, authError, isSignedIn, canViewAdmin, isDemo, email, signIn, signOut } = useAuth()
const { reload, loading, saveError } = useAdminData()

type Tab = 'periods' | 'celebrate' | 'agents' | 'teams' | 'reports' | 'data' | 'storage'
const tab = ref<Tab>('periods')
const tabs: Tab[] = ['periods', 'celebrate', 'agents', 'teams', 'reports', 'data', 'storage']

const form = ref({ email: '', password: '' })
const showChangePassword = ref(false)

/**
 * مش "/" ثابتة: على GitHub Pages التطبيق منشور تحت /Leaderboard/، فـ "/" تودّي
 * لجذر النطاق حيث لا يوجد شيء (404). Vite يعيد كتابة مسارات الصور تلقائياً
 * لكن ليس روابط <a>، فنقرأ الأساس منه صراحةً.
 */
const boardUrl = import.meta.env.BASE_URL

async function onSignIn() {
  if (await signIn(form.value.email, form.value.password)) form.value.password = ''
}

// البيانات تُحمَّل بعد ثبوت صلاحية المسؤول، لا قبلها
// مؤشر المساحة يبدأ معها، فالتحذير يظهر على أي تبويب مفتوح
const { worst: storageWorst, start: startStorage, stop: stopStorage } = useStorageHealth()
let watchingStorage = false
function onAllowed() {
  void reload()
  if (!watchingStorage) {
    watchingStorage = true
    startStorage()
  }
}
watch(canViewAdmin, (allowed) => { if (allowed) onAllowed() })
onMounted(() => { if (canViewAdmin.value) onAllowed() })
onBeforeUnmount(() => { if (watchingStorage) stopStorage() })

const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
</script>

<template>
  <div class="min-h-screen flex flex-col bg-page text-strong font-sans">
    <header
      class="flex flex-wrap items-center justify-between gap-3 bg-header text-white px-4 py-3 sm:px-8 lg:px-12"
    >
      <div class="flex items-center gap-3 min-w-0">
        <img src="/logo.png" :alt="t('brand')" class="h-8 w-auto shrink-0" draggable="false" />
        <div class="w-px h-8 bg-white/10" />
        <h1 class="m-0 font-semibold text-lg lg:text-xl truncate">{{ t('admin.title') }}</h1>
      </div>

      <!-- أزرار التنقّل تختفي عند طباعة تقرير؛ الشعار والعنوان يبقيان في الورقة -->
      <div class="flex items-center gap-2" data-export-hide>
        <a
          :href="boardUrl"
          class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/75 transition-colors hover:text-white"
        >
          <iconify-icon icon="mdi:view-dashboard-outline" aria-hidden="true" />
          {{ t('admin.backToBoard') }}
        </a>
        <!-- حساب العرض مشترك بين المقيّمين: تغيير كلمته يقفله على الباقين -->
        <button
          v-if="isSignedIn && !isDemo"
          type="button"
          class="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/75 transition-colors hover:text-white"
          @click="showChangePassword = !showChangePassword"
        >{{ t('admin.changePassword') }}</button>
        <button
          v-if="isSignedIn"
          type="button"
          class="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/75 transition-colors hover:text-white"
          @click="signOut"
        >{{ t('admin.signOut') }}</button>
      </div>
    </header>

    <main class="flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
      <p v-if="!ready" class="text-center font-medium text-mute py-20">{{ t('admin.checking') }}</p>

      <div v-if="isSignedIn && showChangePassword && !isDemo" class="mx-auto mb-6 max-w-sm">
        <ChangePasswordCard />
      </div>

      <!-- تسجيل الدخول -->
      <form
        v-else-if="!isSignedIn"
        class="mx-auto flex max-w-sm flex-col gap-4 rounded-xl border border-card-border bg-card p-6 shadow-[var(--shadow-panel)]"
        @submit.prevent="onSignIn"
      >
        <h2 class="m-0 font-semibold text-strong text-lg">{{ t('admin.signIn') }}</h2>

        <label class="flex flex-col gap-1.5">
          <span class="font-semibold text-caption text-mute">{{ t('admin.email') }}</span>
          <input
            v-model="form.email"
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
            v-model="form.password"
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
      </form>

      <!-- مسجَّل لكن ليس مسؤولاً -->
      <div
        v-else-if="!canViewAdmin"
        class="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-card-border bg-card p-8 text-center shadow-[var(--shadow-panel)]"
      >
        <iconify-icon icon="mdi:lock-outline" aria-hidden="true" class="text-dim text-5xl" />
        <p class="m-0 font-semibold text-strong text-lg">{{ t('admin.notAdmin') }}</p>
        <p class="m-0 text-mute text-sm">{{ t('admin.notAdminHint', { email }) }}</p>
      </div>

      <!-- لوحة الإدارة -->
      <div v-else class="flex flex-col gap-6">
        <div
          v-if="isDemo"
          role="note"
          data-export-hide
          class="flex items-start gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-strong"
        >
          <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="mt-0.5 shrink-0 text-gold text-xl" />
          <div class="flex flex-col gap-0.5">
            <p class="m-0 font-semibold text-sm">{{ t('admin.demoTitle') }}</p>
            <p class="m-0 text-mute text-caption leading-relaxed">{{ t('admin.demoHint') }}</p>
          </div>
        </div>

        <!-- تحذير المساحة على كل التبويبات، لا في تبويب المساحة وحده -->
        <div
          v-if="storageWorst !== 'ok' && tab !== 'storage'"
          role="alert"
          data-export-hide
          class="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-strong"
          :class="storageWorst === 'critical' ? 'border-down/50 bg-down/10' : 'border-gold/50 bg-gold/10'"
        >
          <iconify-icon
            icon="mdi:alert-outline"
            aria-hidden="true"
            class="shrink-0 text-xl"
            :class="storageWorst === 'critical' ? 'text-down' : 'text-gold'"
          />
          <p class="m-0 flex-1 font-semibold text-sm">{{ t(`admin.storage.alert.${storageWorst}`) }}</p>
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-1.5 text-caption font-semibold text-white transition-colors hover:bg-accent-strong"
            @click="tab = 'storage'"
          >{{ t('admin.storage.open') }}</button>
        </div>

        <div
          class="flex flex-wrap items-center gap-1 self-start rounded-lg border border-card-border bg-card p-1"
          role="tablist"
          data-export-hide
          :aria-label="t('admin.title')"
        >
          <button
            v-for="name in tabs"
            :key="name"
            type="button"
            role="tab"
            :aria-selected="tab === name"
            class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="tab === name ? 'bg-accent text-white' : 'text-mute hover:text-strong'"
            @click="tab = name"
          >{{ t(name === 'storage' ? 'admin.storage.tab' : `admin.${name}`) }}</button>
        </div>

        <p v-if="loading" class="m-0 font-medium text-mute text-sm">{{ t('admin.loading') }}</p>
        <p v-if="saveError" role="alert" class="m-0 font-medium text-down text-sm">{{ saveError }}</p>

        <PeriodsAdmin v-if="tab === 'periods'" />
        <CelebrateAdmin v-else-if="tab === 'celebrate'" />
        <AgentsAdmin v-else-if="tab === 'agents'" />
        <TeamsAdmin v-else-if="tab === 'teams'" />
        <ReportsAdmin v-else-if="tab === 'reports'" />
        <StorageAdmin v-else-if="tab === 'storage'" @goto="tab = $event" />
        <DataTransfer v-else />
      </div>
    </main>
  </div>
</template>
