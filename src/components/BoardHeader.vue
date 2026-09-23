<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardView } from '@/lib/types'
import { useBoardData } from '@/composables/useBoardData'
import { isKiosk } from '@/composables/useSettings'
import QuarterSwitcher from './QuarterSwitcher.vue'
import ViewToggle from './ViewToggle.vue'
import StatusBadge from './StatusBadge.vue'
import BoardClock from './BoardClock.vue'
import SettingsMenu from './SettingsMenu.vue'
import NotificationsMenu from './NotificationsMenu.vue'
import ExportMenu from './ExportMenu.vue'
import LatestDeals from './LatestDeals.vue'

const props = defineProps<{
  view: BoardView
  settingsOpen: boolean
  isFullscreen: boolean
  exportTarget: HTMLElement | null
}>()
const emit = defineEmits<{
  'update:view': [BoardView]
  'update:settingsOpen': [boolean]
  fullscreen: []
}>()

const { t } = useI18n()
const { quarter, year } = useBoardData()

const heading = computed(() => {
  switch (props.view) {
    case 'agents':
      return { title: t('header.agentsTitle'), sub: t('header.agentsSub') }
    case 'insights':
      return { title: t('header.insightsTitle'), sub: t('header.insightsSub') }
    case 'news':
      return { title: t('header.newsTitle'), sub: t('header.newsSub') }
    default:
      return { title: t('header.teamsTitle'), sub: t('header.teamsSub') }
  }
})

const period = computed(() => `${t(`quarter.range.${quarter.value}`)} ${year.value}`)
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 bg-header text-white px-4 py-3 sm:px-8 sm:py-4 lg:px-16 lg:min-h-[clamp(80px,10.5vh,112px)] lg:py-2"
  >
    <h1 class="sr-only">{{ t('brand') }} — {{ heading.title }}</h1>

    <div class="flex items-center gap-2.5 sm:gap-4 min-w-0">
      <img
        src="/logo.png"
        :alt="t('brand')"
        class="w-auto shrink-0 select-none h-8 sm:h-9 lg:h-[clamp(30px,4.4vh,42px)]"
        draggable="false"
      />
      <div class="hidden md:block w-px h-9 bg-white/10 mx-1.5 lg:mx-2.5" />
      <div class="hidden md:flex flex-col gap-1.5 min-w-0" aria-hidden="true">
        <p class="m-0 font-semibold tracking-[-0.01em] leading-none text-xl lg:text-name truncate">
          {{ heading.title }}
        </p>
        <p class="m-0 font-medium text-white/55 text-caption lg:text-note truncate">
          {{ heading.sub }}
        </p>
      </div>
    </div>

    <!-- الكشك بلا جرس إشعارات: آخر الصفقات تتبدّل في المساحة الفاضية بالترويسة -->
    <LatestDeals
      v-if="isKiosk"
      variant="ticker"
      :limit="8"
      class="hidden xl:flex flex-1 max-w-[42rem] mx-4"
      data-export-hide
    />

    <div class="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-end ms-auto">
      <!-- الفترة تبقى في التصدير: التقرير يجب أن يقول أي ربع يغطّي -->
      <div
        class="hidden xl:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold text-sm lg:text-note text-white/85"
      >
        <iconify-icon
          icon="mdi:calendar-month-outline"
          aria-hidden="true"
          class="text-accent-live text-base lg:text-lg"
        />
        <span>{{ period }}</span>
      </div>

      <!-- تبقى في الكشك والتصدير: التقرير المطبوع يجب أن يقول متى أُخِذ -->
      <BoardClock class="shrink-0" />

      <div class="shrink-0" data-kiosk-hide>
        <QuarterSwitcher />
      </div>

      <div data-kiosk-hide data-export-hide>
        <ViewToggle :view="view" @update:view="emit('update:view', $event)" />
      </div>

      <div v-if="!isKiosk" data-kiosk-hide data-export-hide>
        <ExportMenu :target="exportTarget" />
      </div>

      <!-- الاحتفالات تظهر في الكشك أيضاً؛ القائمة نفسها للشاشات التفاعلية فقط -->
      <div v-if="!isKiosk" data-kiosk-hide data-export-hide>
        <NotificationsMenu />
      </div>

      <div v-if="!isKiosk" data-kiosk-hide data-export-hide>
        <SettingsMenu
          :open="settingsOpen"
          :is-fullscreen="isFullscreen"
          @update:open="emit('update:settingsOpen', $event)"
          @fullscreen="emit('fullscreen')"
        />
      </div>

      <StatusBadge />
    </div>
  </header>
</template>
