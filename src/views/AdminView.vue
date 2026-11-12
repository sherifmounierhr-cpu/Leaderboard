<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useAdminData } from '@/composables/useAdminData'
import TeamsAdmin from '@/features/people/TeamsAdmin.vue'
import AgentsAdmin from '@/features/people/AgentsAdmin.vue'
import PeriodsAdmin from '@/features/sales/PeriodsAdmin.vue'
import DealsAdmin from '@/features/sales/DealsAdmin.vue'
import DevicesAdmin from '@/features/screen/DevicesAdmin.vue'
import MarketRatesAdmin from '@/features/screen/MarketRatesAdmin.vue'
import NewsAdmin from '@/features/screen/NewsAdmin.vue'
import ChangePasswordCard from '@/features/people/ChangePasswordCard.vue'
import ReportsAdmin from '@/features/sales/ReportsAdmin.vue'
import DataTransfer from '@/features/sales/DataTransfer.vue'
import CelebrationPanel from '@/features/screen/CelebrationPanel.vue'
import DirectorsPanel from '@/features/people/DirectorsPanel.vue'
import StorageAdmin from '@/features/system/StorageAdmin.vue'
import DisplayControlAdmin from '@/features/screen/DisplayControlAdmin.vue'
import AnnouncementsAdmin from '@/features/screen/AnnouncementsAdmin.vue'
import OwnerAdmin from '@/features/people/OwnerAdmin.vue'
import OwnerMessageOverlay from '@/features/overlays/OwnerMessageOverlay.vue'
import { useOwners } from '@/composables/useOwners'
import { useLocalName } from '@/composables/useLocalName'
import { supabase } from '@/lib/supabase'
import UsersAdmin from '@/features/people/UsersAdmin.vue'
import AuditLogAdmin from '@/features/system/AuditLogAdmin.vue'
import { tabLabelKey, visibleNav, type AdminTab } from '@/lib/adminTabs'
import AnnouncementOverlay from '@/features/overlays/AnnouncementOverlay.vue'
import SoundUnlock from '@/features/overlays/SoundUnlock.vue'
import SignInScreen from '@/shared/ui/SignInScreen.vue'
import BrandLogo from '@/shared/ui/BrandLogo.vue'
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
  ready, isSignedIn, canViewAdmin, isDemo, isSharedDemo, role, permissions,
  email, signOut, photoUrl, username, preview, stopPreview,
} = useAuth()
/** اسم الداخل وأول حرفين منه (لو مفيش صورة). */
const meName = computed(() => username.value || email.value)
const meInitials = computed(() => meName.value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())
const { reload, loading, saveError } = useAdminData()

/**
 * التنقّل مجموعات (الأشخاص/المبيعات/الشاشة/النظام) حسب الصلاحية — الإخفاء للواجهة
 * فقط، والقاعدة ترفض أي كتابة خارجها. المصدر: src/lib/adminTabs.ts.
 */
const groups = computed(() => visibleNav(permissions.value, isDemo.value))
const tabs = computed<AdminTab[]>(() => groups.value.flatMap((g) => g.items.map((i) => i.key)))
const tab = ref<AdminTab>('periods')
const currentGroup = computed(() => groups.value.find((g) => g.items.some((i) => i.key === tab.value)))
watch(tabs, (list) => { if (list.length && !list.includes(tab.value)) tab.value = list[0] }, { immediate: true })
const tabList = ref<HTMLElement | null>(null)
/** درج التنقّل على الموبايل. */
const drawerOpen = ref(false)
function pickFromDrawer(name: AdminTab) {
  tab.value = name
  drawerOpen.value = false
}
function onDrawerKey(e: KeyboardEvent) {
  if (e.key === 'Escape') drawerOpen.value = false
}
watch(drawerOpen, (open) => {
  if (open) document.addEventListener('keydown', onDrawerKey)
  else document.removeEventListener('keydown', onDrawerKey)
  document.body.style.overflow = open ? 'hidden' : ''
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDrawerKey)
  document.body.style.overflow = ''
})
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

/** تبويب صاحب العمل باسمه لو اتسجّل، وإلا «صاحب العمل الأول/التاني». */
const { owners: ownerList, reload: reloadOwners } = useOwners()
const localName = useLocalName()
function tabLabel(name: AdminTab) {
  if (name === 'owner1' || name === 'owner2') {
    const o = ownerList.value.find((x) => x.slot === (name === 'owner1' ? 1 : 2))
    const n = o ? localName(o.name, o.name_ar) : ''
    if (n) return n
  }
  return t(tabLabelKey(name))
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
  void reloadOwners()
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
    <!-- «شوف شاشته»: معاينة بصلاحيات مستخدم تاني — قراءة فقط -->
    <div
      v-if="preview"
      role="status"
      data-export-hide
      class="sticky top-0 z-40 flex flex-wrap items-center gap-3 bg-gold px-4 py-2 text-sm font-semibold text-header sm:px-8"
    >
      <iconify-icon icon="mdi:eye-outline" aria-hidden="true" class="text-lg" />
      <span class="min-w-0 flex-1">{{ t('users.previewing', { name: preview.name }) }}</span>
      <button
        type="button"
        class="rounded-lg bg-header px-3 py-1.5 text-caption font-bold text-white transition-opacity hover:opacity-90"
        @click="stopPreview"
      >{{ t('users.previewExit') }}</button>
    </div>
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
        <!-- مين داخل: صورته واسمه -->
        <span v-if="isSignedIn && meName" class="me-1 inline-flex items-center gap-2 max-lg:hidden" :title="meName">
          <span class="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 text-sm font-bold text-white ring-2 ring-white/25">
            <img v-if="photoUrl" :src="photoUrl" alt="" class="size-full object-cover" />
            <span v-else aria-hidden="true">{{ meInitials }}</span>
          </span>
          <span dir="ltr" class="max-w-40 truncate text-sm font-semibold text-white/90">{{ meName }}</span>
        </span>
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
        <!-- موبايل: شريط بالتبويب الحالي بيفتح درج التنقّل -->
        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-card-border bg-card px-4 text-start shadow-[var(--shadow-card)] lg:hidden"
          data-export-hide
          aria-haspopup="dialog"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = true"
        >
          <iconify-icon icon="mdi:menu" aria-hidden="true" class="text-xl text-mute" />
          <span class="flex min-w-0 flex-1 flex-col leading-tight">
            <span v-if="currentGroup" class="truncate text-caption font-semibold text-dim">{{ t(currentGroup.label) }}</span>
            <span class="truncate text-sm font-bold text-strong">{{ tabLabel(tab) }}</span>
          </span>
          <iconify-icon icon="mdi:chevron-down" aria-hidden="true" class="text-xl text-mute" />
        </button>

        <!-- التنقّل: عمود جانبي ثابت على الشاشات العريضة -->
        <nav
          ref="tabList"
          class="flex-col items-stretch gap-1 rounded-2xl border border-card-border bg-card p-2 shadow-[var(--shadow-card)] max-lg:hidden lg:sticky lg:top-6 lg:flex"
          role="tablist"
          data-export-hide
          :aria-label="t('admin.title')"
          @keydown="onTabKey"
        >
          <template v-for="(group, gi) in groups" :key="group.key">
            <!-- عنوان المجموعة (على الشاشة العريضة)؛ على الموبايل فاصل رفيع بين المجموعات -->
            <p
              role="presentation"
              class="m-0 flex items-center gap-2 px-3.5 pb-1 pt-3 text-caption font-bold tracking-wide text-dim"
              :class="gi === 0 ? '!pt-1' : ''"
            >
              <iconify-icon :icon="group.icon" aria-hidden="true" class="text-base" />
              {{ t(group.label) }}
            </p>
            <button
              v-for="item in group.items"
              :id="`admin-tab-${item.key}`"
              :key="item.key"
              type="button"
              role="tab"
              :aria-selected="tab === item.key"
              aria-controls="admin-panel"
              :tabindex="tab === item.key ? 0 : -1"
              class="relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 min-h-11 text-sm font-semibold text-start transition-colors duration-200"
              :class="tab === item.key
                ? 'bg-accent text-white shadow-[0_8px_16px_-10px_var(--color-accent)]'
                : 'text-mute hover:bg-accent/[0.08] hover:text-strong'"
              @click="tab = item.key"
            >
              <iconify-icon :icon="item.icon" aria-hidden="true" class="text-lg shrink-0" />
              {{ tabLabel(item.key) }}
            </button>
          </template>
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

        <!-- مسار الصفحة: المجموعة ‹ التبويب -->
        <p v-if="currentGroup" class="m-0 flex items-center gap-1.5 text-caption font-semibold text-dim" data-export-hide>
          <iconify-icon :icon="currentGroup.icon" aria-hidden="true" />
          {{ t(currentGroup.label) }}
          <iconify-icon icon="mdi:chevron-left" aria-hidden="true" class="ltr:rotate-180" />
          <span class="text-mute">{{ tabLabel(tab) }}</span>
        </p>

        <div :key="tab" class="fade-in flex min-w-0 flex-col gap-6">
        <PeriodsAdmin v-if="tab === 'periods'" />
        <DealsAdmin v-else-if="tab === 'deals'" />
        <CelebrationPanel v-else-if="tab === 'celebrate'" />
        <DirectorsPanel v-else-if="tab === 'directors'" />
        <DisplayControlAdmin v-else-if="tab === 'display'" />
        <AnnouncementsAdmin v-else-if="tab === 'messages'" />
        <OwnerAdmin v-else-if="tab === 'owner1'" key="owner1" :owner-slot="1" />
        <OwnerAdmin v-else-if="tab === 'owner2'" key="owner2" :owner-slot="2" />
        <AgentsAdmin v-else-if="tab === 'agents'" />
        <TeamsAdmin v-else-if="tab === 'teams'" />
        <ReportsAdmin v-else-if="tab === 'reports'" />
        <NewsAdmin v-else-if="tab === 'newsfeed'" />
        <MarketRatesAdmin v-else-if="tab === 'rates'" />
        <DevicesAdmin v-else-if="tab === 'devices'" />
        <StorageAdmin v-else-if="tab === 'storage'" @goto="goto($event)" />
        <UsersAdmin v-else-if="tab === 'users'" />
        <AuditLogAdmin v-else-if="tab === 'audit'" />
        <DataTransfer v-else-if="tab === 'data'" />
        </div>
        </div>
      </div>
    </main>

    <!-- درج التنقّل (موبايل) -->
    <Transition name="nav-drawer">
      <div v-if="drawerOpen" class="fixed inset-0 z-50 lg:hidden" data-export-hide>
        <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="drawerOpen = false" />
        <nav
          class="nav-drawer-panel absolute inset-y-0 start-0 flex w-[min(20rem,86vw)] flex-col gap-1 overflow-y-auto bg-card p-3 shadow-2xl"
          role="dialog"
          aria-modal="true"
          :aria-label="t('admin.title')"
        >
          <div class="mb-1 flex items-center justify-between px-1">
            <span class="text-sm font-bold text-strong">{{ t('admin.title') }}</span>
            <button
              type="button"
              class="inline-flex size-11 items-center justify-center rounded-lg text-mute hover:text-strong"
              :aria-label="t('admin.cancel')"
              @click="drawerOpen = false"
            >
              <iconify-icon icon="mdi:close" aria-hidden="true" class="text-xl" />
            </button>
          </div>
          <template v-for="(group, gi) in groups" :key="group.key">
            <p
              class="m-0 flex items-center gap-2 px-3 pb-1 pt-3 text-caption font-bold tracking-wide text-dim"
              :class="gi === 0 ? '!pt-1' : ''"
            >
              <iconify-icon :icon="group.icon" aria-hidden="true" class="text-base" />
              {{ t(group.label) }}
            </p>
            <button
              v-for="item in group.items"
              :key="item.key"
              type="button"
              :aria-current="tab === item.key ? 'page' : undefined"
              class="flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-start text-sm font-semibold transition-colors"
              :class="tab === item.key ? 'bg-accent text-white' : 'text-mute hover:bg-accent/[0.08] hover:text-strong'"
              @click="pickFromDrawer(item.key)"
            >
              <iconify-icon :icon="item.icon" aria-hidden="true" class="text-lg shrink-0" />
              {{ tabLabel(item.key) }}
            </button>
          </template>
        </nav>
      </div>
    </Transition>

    <!-- معاينة الرسائل على هذه الشاشة فقط -->
    <AnnouncementOverlay preview-only />
    <OwnerMessageOverlay preview-only />
    <SoundUnlock />
  </div>
</template>

<style scoped>
.nav-drawer-enter-active, .nav-drawer-leave-active { transition: opacity 200ms ease; }
.nav-drawer-enter-active .nav-drawer-panel, .nav-drawer-leave-active .nav-drawer-panel { transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.nav-drawer-enter-from, .nav-drawer-leave-to { opacity: 0; }
.nav-drawer-enter-from .nav-drawer-panel, .nav-drawer-leave-to .nav-drawer-panel { transform: translateX(-100%); }
:global([dir='rtl']) .nav-drawer-enter-from .nav-drawer-panel,
:global([dir='rtl']) .nav-drawer-leave-to .nav-drawer-panel { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) {
  .nav-drawer-enter-active .nav-drawer-panel, .nav-drawer-leave-active .nav-drawer-panel { transition: none; }
}
</style>
