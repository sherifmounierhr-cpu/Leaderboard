<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useBoardControls } from '@/composables/useBoardControls'
import { useWakeLock } from '@/composables/useWakeLock'
import SignInScreen from '@/components/SignInScreen.vue'
import BoardHeader from '@/components/BoardHeader.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import TeamsView from '@/views/TeamsView.vue'
import AgentsView from '@/views/AgentsView.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import KpiStrip from '@/components/KpiStrip.vue'
import AnnouncementOverlay from '@/components/AnnouncementOverlay.vue'
import SoundUnlock from '@/components/SoundUnlock.vue'
import NewsView from '@/views/NewsView.vue'
import BreakingNewsOverlay from '@/components/BreakingNewsOverlay.vue'
import NewsCastOverlay from '@/components/NewsCastOverlay.vue'
import MarketsView from '@/views/MarketsView.vue'
import MarketAlertOverlay from '@/components/MarketAlertOverlay.vue'
import { settings } from '@/composables/useSettings'
import { secondsFor } from '@/composables/useBoardControls'
import { useDevice } from '@/composables/useDevice'

/*
 * شاشة التحليلات بتتحمّل عند أول فتح بس: هي مش في التدوير التلقائي،
 * بتتفتح بإيد حد، ومعاها كل رياضة الرسوم. شاشة المكتب ممكن تفضل
 * شغّالة شهور من غير ما حد يفتحها.
 */
const InsightsView = defineAsyncComponent(() => import('@/views/InsightsView.vue'))

const { t } = useI18n()
const { ready, isSignedIn } = useAuth()
const { view, settingsOpen, isFullscreen, toggleFullscreen } = useBoardControls()
useWakeLock()
// تسجيل الشاشة في صفحة الإدارة: مين متصل، ومنها يتقطع الاتصال
watch(isSignedIn, (signed) => { if (signed) useDevice(() => view.value) }, { immediate: true })

/** هدف التصدير: اللوحة كاملة بترويستها. */
const board = ref<HTMLElement | null>(null)
</script>

<template>
  <div
    v-if="!ready"
    class="min-h-screen flex flex-col items-center justify-center gap-5 bg-page font-sans"
    role="status"
  >
    <BrandLogo class="h-16 fade-in" />
    <p class="m-0 font-medium text-mute">{{ t('admin.checking') }}</p>
  </div>

  <!-- لا شيء يقرأ البيانات قبل الدخول: الترويسة والشاشات كلها تحت هذا الشرط -->
  <SignInScreen v-else-if="!isSignedIn" />

  <div
    v-else
    ref="board"
    data-board
    class="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-page text-strong font-sans"
  >
    <a href="#board-main" class="skip-link" data-kiosk-hide data-export-hide>{{ t('a11y.skip') }}</a>
    <BoardHeader
      v-model:view="view"
      v-model:settings-open="settingsOpen"
      :is-fullscreen="isFullscreen"
      :export-target="board"
      @fullscreen="toggleFullscreen"
    />
    <!-- الوقت الباقي قبل الانتقال للشاشة التالية في التبديل التلقائي -->
    <!-- خط الهوية تحت الترويسة؛ مع التبديل التلقائي يمتلئ بالأخضر لحد الانتقال -->
    <div class="h-1 bg-[linear-gradient(90deg,var(--color-accent),var(--color-summit))]" aria-hidden="true">
      <div v-if="settings.rotate" class="h-full bg-header/70" data-export-hide>
        <div
          :key="`${view}-${secondsFor(view)}`"
          class="h-full bg-accent-live animate-rotate-progress"
          :style="{ animationDuration: `${secondsFor(view)}s` }"
        />
      </div>
    </div>
    <main id="board-main" tabindex="-1" class="flex-1 flex flex-col min-h-0 focus:outline-none">
      <!-- ملخص الشركة فوق شاشات الأرقام؛ شاشة الأخبار ليها الشاشة كاملة -->
      <div v-if="view !== 'news' && view !== 'markets'" class="px-4 pt-4 sm:px-8 lg:px-8 2xl:px-16 lg:pt-[clamp(10px,1.8vh,24px)]">
        <KpiStrip />
      </div>
      <!--
        شاشات الأرقام بتتبدّل جوه <main>. الأخبار والأسواق بتغطّي الشاشة كلها
        فبتتركّب برّه الانتقال: جواه كان الانتقال أحياناً يسيب المكان فاضي.
      -->
      <Transition name="view" mode="out-in">
        <AgentsView v-if="view === 'agents'" key="agents" class="flex-1 flex flex-col min-h-0" />
        <InsightsView v-else-if="view === 'insights'" key="insights" class="flex-1 flex flex-col min-h-0" />
        <TeamsView v-else key="teams" class="flex-1 flex flex-col min-h-0" />
      </Transition>
    </main>

    <NewsView v-if="view === 'news'" />
    <MarketsView v-if="view === 'markets'" />

    <CelebrationOverlay />
    <BreakingNewsOverlay />
    <NewsCastOverlay />
    <MarketAlertOverlay />
    <AnnouncementOverlay />
    <SoundUnlock />
  </div>
</template>
