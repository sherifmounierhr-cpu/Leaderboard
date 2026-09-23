<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useBoardControls } from '@/composables/useBoardControls'
import { useWakeLock } from '@/composables/useWakeLock'
import SignInScreen from '@/components/SignInScreen.vue'
import BoardHeader from '@/components/BoardHeader.vue'
import TeamsView from '@/views/TeamsView.vue'
import AgentsView from '@/views/AgentsView.vue'
import InsightsView from '@/views/InsightsView.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'
import KpiStrip from '@/components/KpiStrip.vue'
import AnnouncementOverlay from '@/components/AnnouncementOverlay.vue'
import SoundUnlock from '@/components/SoundUnlock.vue'
import NewsView from '@/views/NewsView.vue'
import BreakingNewsOverlay from '@/components/BreakingNewsOverlay.vue'
import { settings } from '@/composables/useSettings'
import { useDevice } from '@/composables/useDevice'

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
  <p
    v-if="!ready"
    class="min-h-screen flex items-center justify-center bg-page font-sans font-medium text-mute"
  >{{ t('admin.checking') }}</p>

  <!-- لا شيء يقرأ البيانات قبل الدخول: الترويسة والشاشات كلها تحت هذا الشرط -->
  <SignInScreen v-else-if="!isSignedIn" />

  <div
    v-else
    ref="board"
    data-board
    class="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-page text-strong font-sans"
  >
    <BoardHeader
      v-model:view="view"
      v-model:settings-open="settingsOpen"
      :is-fullscreen="isFullscreen"
      :export-target="board"
      @fullscreen="toggleFullscreen"
    />
    <!-- الوقت الباقي قبل الانتقال للشاشة التالية في التبديل التلقائي -->
    <div v-if="settings.rotate" class="h-1 bg-header" aria-hidden="true" data-export-hide>
      <div
        :key="`${view}-${settings.rotateSeconds}`"
        class="h-full bg-accent-live/80 animate-rotate-progress"
        :style="{ animationDuration: `${settings.rotateSeconds}s` }"
      />
    </div>
    <main class="flex-1 flex flex-col min-h-0">
      <!-- ملخص الشركة فوق شاشات الأرقام؛ شاشة الأخبار ليها الشاشة كاملة -->
      <div v-if="view !== 'news'" class="px-4 pt-4 sm:px-8 lg:px-16 lg:pt-[clamp(10px,1.8vh,24px)]">
        <KpiStrip />
      </div>
      <Transition name="view" mode="out-in">
        <TeamsView v-if="view === 'teams'" key="teams" class="flex-1 flex flex-col min-h-0" />
        <AgentsView v-else-if="view === 'agents'" key="agents" class="flex-1 flex flex-col min-h-0" />
        <InsightsView v-else-if="view === 'insights'" key="insights" class="flex-1 flex flex-col min-h-0" />
        <NewsView v-else key="news" class="flex-1 flex flex-col min-h-0" />
      </Transition>
    </main>

    <CelebrationOverlay />
    <BreakingNewsOverlay />
    <AnnouncementOverlay />
    <SoundUnlock />
  </div>
</template>
