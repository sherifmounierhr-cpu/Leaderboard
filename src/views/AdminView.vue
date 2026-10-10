<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useAdminData } from '@/composables/useAdminData'
import TeamsAdmin from '@/components/admin/TeamsAdmin.vue'
import AgentsAdmin from '@/components/admin/AgentsAdmin.vue'
import PeriodsAdmin from '@/components/admin/PeriodsAdmin.vue'
import DealsAdmin from '@/components/admin/DealsAdmin.vue'
import DevicesAdmin from '@/components/admin/DevicesAdmin.vue'
import MarketRatesAdmin from '@/components/admin/MarketRatesAdmin.vue'
import NewsAdmin from '@/components/admin/NewsAdmin.vue'
import ChangePasswordCard from '@/components/admin/ChangePasswordCard.vue'
import ReportsAdmin from '@/components/admin/ReportsAdmin.vue'
import DataTransfer from '@/components/admin/DataTransfer.vue'
import CelebrateAdmin from '@/components/admin/CelebrateAdmin.vue'
import QuarterCelebrateAdmin from '@/components/admin/QuarterCelebrateAdmin.vue'
import DirectorsAdmin from '@/components/admin/DirectorsAdmin.vue'
import ManagerCutoutsAdmin from '@/components/admin/ManagerCutoutsAdmin.vue'
import StorageAdmin from '@/components/admin/StorageAdmin.vue'
import CelebrationSettings from '@/components/admin/CelebrationSettings.vue'
import MediaLibrary from '@/components/admin/MediaLibrary.vue'
import AnnouncementsAdmin from '@/components/admin/AnnouncementsAdmin.vue'
import { supabase } from '@/lib/supabase'
import UsersAdmin from '@/components/admin/UsersAdmin.vue'
import AuditLogAdmin from '@/components/admin/AuditLogAdmin.vue'
import { ADMIN_TABS, tabLabelKey, type AdminTab } from '@/lib/adminTabs'
import AnnouncementOverlay from '@/components/AnnouncementOverlay.vue'
import SoundUnlock from '@/components/SoundUnlock.vue'
import SignInScreen from '@/components/SignInScreen.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import '@/composables/useSettings'
import { useStorageHealth } from '@/composables/useStorageHealth'
import { applyLocale, rememberLocale } from '@/i18n'
import type { LocaleName } from '@/lib/types'

const { t, locale } = useI18n()

/** تبديل لغة لوحة الإدارة: يتطبّق فوراً ويتحفظ على الجهاز. */
function toggleLanguage() {
  const next: LocaleName = locale.value === 'ar' ? 'en' : 'ar'
  applyLocale(next)
  rememberLocale(next)
}

const {
  ready, isSignedIn, canViewAdmin, isDemo, isSharedDemo, role, permissions, canSee,
  email, signOut,
} = useAuth()
const { reload, loading, saveError } = useAdminData()

/** التبويبات حسب الصلاحية — الإخفاء للواجهة فقط، والقاعدة ترفض أي كتابة خارجها. */
const tabs = computed<AdminTab[]>(() => {
  void permissions.value
  const visible: AdminTab[] = ADMIN_TABS.filter((name) => canSee(name))
  if (permissions.value.includes('users')) visible.push('users')
  return visible
})
const tab = ref<AdminTab>('periods')
watch(tabs, (list) => { if (list.length && !list.includes(tab.value)) tab.value = list[0] }, { immediate: true })
const tabList = ref<HTMLElement | null>(null)
function goto(name: AdminTab) { if (tabs.value.includes(name)) tab.value = name }
// شريط التبويبات على الموبايل بيتمرّر أفقياً: المختار يتجاب قدام العين
watch(tab, () => {
  void nextTick(() => {
    const list = tabList.value
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !el || list.scrollWidth <= list.clientWidth) return
    // تمرير الشريط نفسه فقط (مش scrollIntoView): الصفحة ما تتحركش رأسياً. الفرق بين المركزين يشتغل في الاتجاهين.
    const a = el.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    list.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2)
  })
})

const TAB_ICON: Record<AdminTab, string> = {
  periods: 'mdi:target',
  deals: 'mdi:handshake-outline',
  celebrate: 'mdi:party-popper',
  messages: 'mdi:message-text-outline',
  agents: 'mdi:account-tie-outline',
  teams: 'mdi:account-group-outline',
  reports: 'mdi:file-chart-outline',
  data: 'mdi:database-import-outline',
  newsfeed: 'mdi:newspaper-variant-outline',
  rates: 'mdi:chart-line',
  devices: 'mdi:monitor-dashboard',
  storage: 'mdi:harddisk',
  users: 'mdi:shield-account-outline',
}

/** الأسهم تتنقّل بين التبويبات (نمط tablist): تركيز واحد يدخل القائمة والأسهم تكمّل. */
function onTabKey(e: KeyboardEvent) {
  const list = tabs.value
  const at = list.indexOf(tab.value)
  const forward = ['ArrowDown', locale.value === 'ar' ? 'ArrowLeft' : 'ArrowRight']
  const back = ['ArrowUp', locale.value === 'ar' ? 'ArrowRight' : 'ArrowLeft']
  let next = at
  if (forward.includes(e.key)) next = (at + 1) % list.length
  else if (back.includes(e.key)) next = (at - 1 + list.length) % list.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = list.length - 1
  else return
  e.preventDefault()
  tab.value = list[next]
  void nextTick(() => tabList.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}

const showChangePassword = ref(false)

/**
 * مش "/" ثابتة: على GitHub Pages التطبيق منشور تحت /Leaderboard/، فـ "/" تودّي
 * لجذر النطاق حيث لا يوجد شيء (404). Vite يعيد كتابة مسارات الصور تلقائياً
 * لكن ليس روابط <a>، فنقرأ الأساس منه صراحةً.
 */
const boardUrl = import.meta.env.BASE_URL

// البيانات تُحمَّل بعد ثبوت صلاحية المسؤول، لا قبلها
// مؤشر المساحة يبدأ معها، فالتحذير يظهر على أي تبويب مفتوح
const { worst: storageWorst, start: startStorage, stop: stopStorage } = useStorageHealth()
let watchingStorage = false
function onAllowed() {
  void reload()
  // سجل المستخدمين: دخول لوحة الإدارة (القاعدة تكتفي بمرة كل نصف ساعة)
  void supabase.rpc('lb_log_admin_visit').then(() => undefined, () => undefined)
  if (!watchingStorage) {
    watchingStorage = true
    startStorage()
  }
}
watch(canViewAdmin, (allowed) => { if (allowed) onAllowed() })
onMounted(() => { if (canViewAdmin.value) onAllowed() })
onBeforeUnmount(() => { if (watchingStorage) stopStorage() })
</script>

<template>
  <!-- الدخول بنفس شاشة اللوحة: هوية واحدة، وحقول بنفس الإتاحة -->
  <SignInScreen v-if="ready && !isSignedIn" :title="t('admin.title')" :subtitle="t('admin.signIn')" />

  <div v-else data-admin class="min-h-screen flex flex-col bg-page text-strong font-sans">
    <a href="#admin-main" class="skip-link" data-export-hide>{{ t('a11y.skip') }}</a>
    <header
      class="relative isolate flex items-center justify-between gap-3 bg-[linear-gradient(100deg,var(--color-header),var(--color-header-2))] text-white px-4 py-3 sm:px-8 lg:px-12"
    >
      <span class="peaks -z-10" aria-hidden="true" data-export-hide />
      <div class="flex items-center gap-3 min-w-0">
        <BrandLogo tone="white" class="h-9 sm:h-10" />
        <div class="w-px h-9 bg-white/15 max-sm:hidden" />
        <h1 class="m-0 font-extrabold text-lg lg:text-xl truncate max-sm:sr-only">{{ t('admin.title') }}</h1>
      </div>

      <!-- أزرار التنقّل تختفي عند طباعة تقرير؛ الشعار والعنوان يبقيان في الورقة -->
      <div class="flex shrink-0 items-center justify-end gap-2" data-export-hide>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-10 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-white/85 transition-colors duration-200 hover:bg-white/[0.14] hover:text-white"
          :aria-label="t('settings.language')"
          @click="toggleLanguage"
        >
          <iconify-icon icon="mdi:translate" aria-hidden="true" class="text-lg" />
          <span class="max-sm:sr-only">{{ locale === 'ar' ? 'English' : 'العربية' }}</span>
        </button>
        <a
          :href="boardUrl"
          class="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-10 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-white/85 transition-colors duration-200 hover:bg-white/[0.14] hover:text-white"
        >
          <iconify-icon icon="mdi:view-dashboard-outline" aria-hidden="true" class="text-lg" />
          <span class="max-sm:sr-only">{{ t('admin.backToBoard') }}</span>
        </a>
        <!-- حساب العرض مشترك بين المقيّمين: تغيير كلمته يقفله على الباقين -->
        <button
          v-if="isSignedIn && !isSharedDemo"
          type="button"
          class="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-10 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-white/85 transition-colors duration-200 hover:bg-white/[0.14] hover:text-white"
          :aria-expanded="showChangePassword"
          @click="showChangePassword = !showChangePassword"
        >
          <iconify-icon icon="mdi:key-variant" aria-hidden="true" class="text-lg" />
          <span class="max-sm:sr-only">{{ t('admin.changePassword') }}</span>
        </button>
        <button
          v-if="isSignedIn"
          type="button"
          class="inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-10 whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-white/85 transition-colors duration-200 hover:bg-white/[0.14] hover:text-white"
          @click="signOut"
        >
          <iconify-icon icon="mdi:logout" aria-hidden="true" class="text-lg rtl:-scale-x-100" />
          <span class="max-sm:sr-only">{{ t('admin.signOut') }}</span>
        </button>
      </div>
    </header>
    <div class="h-1 bg-[linear-gradient(90deg,var(--color-accent),var(--color-summit))]" aria-hidden="true" />

    <main id="admin-main" tabindex="-1" class="flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-8 focus:outline-none">
      <p v-if="!ready" class="text-center font-medium text-mute py-20">{{ t('admin.checking') }}</p>

      <div v-if="isSignedIn && showChangePassword && !isSharedDemo" class="mx-auto mb-6 max-w-sm">
        <ChangePasswordCard />
      </div>

      <!-- مسجَّل لكن ليس مسؤولاً -->
      <div
        v-else-if="isSignedIn && !canViewAdmin"
        class="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-card-border bg-card p-8 text-center shadow-[var(--shadow-panel)]"
      >
        <iconify-icon icon="mdi:lock-outline" aria-hidden="true" class="text-dim text-5xl" />
        <p class="m-0 font-semibold text-strong text-lg">{{ t('admin.notAdmin') }}</p>
        <p class="m-0 text-mute text-sm">{{ t('admin.notAdminHint', { email }) }}</p>
      </div>

      <!-- لوحة الإدارة -->
      <div v-else-if="isSignedIn" class="flex flex-col gap-6 lg:grid lg:grid-cols-[236px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <!-- التنقّل: عمود جانبي ثابت على الشاشات العريضة، وشريط يتمرّر أفقياً على الموبايل -->
        <nav
          ref="tabList"
          class="flex gap-1 overflow-x-auto rounded-2xl border border-card-border bg-card p-1.5 shadow-[var(--shadow-card)] lg:sticky lg:top-6 lg:flex-col lg:overflow-visible lg:p-2"
          role="tablist"
          data-export-hide
          :aria-label="t('admin.title')"
          @keydown="onTabKey"
        >
          <button
            v-for="name in tabs"
            :id="`admin-tab-${name}`"
            :key="name"
            type="button"
            role="tab"
            :aria-selected="tab === name"
            aria-controls="admin-panel"
            :tabindex="tab === name ? 0 : -1"
            class="relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 min-h-11 text-sm font-semibold text-start transition-colors duration-200"
            :class="tab === name
              ? 'bg-accent text-white shadow-[0_8px_16px_-10px_var(--color-accent)]'
              : 'text-mute hover:bg-accent/[0.08] hover:text-strong'"
            @click="tab = name"
          >
            <iconify-icon :icon="TAB_ICON[name]" aria-hidden="true" class="text-lg shrink-0" />
            {{ t(tabLabelKey(name)) }}
          </button>
        </nav>

        <div id="admin-panel" role="tabpanel" :aria-labelledby="`admin-tab-${tab}`" class="flex min-w-0 flex-col gap-6">
        <div
          v-if="isDemo"
          role="note"
          data-export-hide
          class="flex items-start gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-strong"
        >
          <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="mt-0.5 shrink-0 text-gold text-xl" />
          <div class="flex flex-col gap-0.5">
            <p class="m-0 font-semibold text-sm">{{ t(role === 'readonly' ? 'users.readonlyTitle' : 'admin.demoTitle') }}</p>
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
            @click="goto('storage')"
          >{{ t('admin.storage.open') }}</button>
        </div>

        <p v-if="loading" role="status" class="m-0 flex items-center gap-2 font-medium text-mute text-sm">
          <iconify-icon icon="mdi:loading" aria-hidden="true" class="animate-spin" />{{ t('admin.loading') }}
        </p>
        <p v-if="saveError" role="alert" class="m-0 font-medium text-down text-sm">{{ saveError }}</p>

        <div :key="tab" class="fade-in flex min-w-0 flex-col gap-6">
        <PeriodsAdmin v-if="tab === 'periods'" />
        <DealsAdmin v-else-if="tab === 'deals'" />
        <!-- الاحتفال: التهنئة والإعدادات جنب مكتبة الصوت -->
        <div v-else-if="tab === 'celebrate'" class="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <div class="flex flex-col gap-6">
            <CelebrateAdmin />
            <QuarterCelebrateAdmin />
            <DirectorsAdmin />
            <ManagerCutoutsAdmin />
            <CelebrationSettings />
          </div>
          <MediaLibrary />
        </div>
        <AnnouncementsAdmin v-else-if="tab === 'messages'" />
        <AgentsAdmin v-else-if="tab === 'agents'" />
        <TeamsAdmin v-else-if="tab === 'teams'" />
        <ReportsAdmin v-else-if="tab === 'reports'" />
        <NewsAdmin v-else-if="tab === 'newsfeed'" />
        <MarketRatesAdmin v-else-if="tab === 'rates'" />
        <DevicesAdmin v-else-if="tab === 'devices'" />
        <StorageAdmin v-else-if="tab === 'storage'" @goto="goto($event)" />
        <div v-else-if="tab === 'users'" class="flex flex-col gap-8">
          <UsersAdmin />
          <AuditLogAdmin />
        </div>
        <DataTransfer v-else-if="tab === 'data'" />
        </div>
        </div>
      </div>
    </main>

    <!-- معاينة الرسائل على هذه الشاشة فقط -->
    <AnnouncementOverlay preview-only />
    <SoundUnlock />
  </div>
</template>
