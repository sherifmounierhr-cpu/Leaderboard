<script setup lang="ts">
import { ref } from 'vue'
import { useBoardControls } from '@/composables/useBoardControls'
import { useWakeLock } from '@/composables/useWakeLock'
import BoardHeader from '@/components/BoardHeader.vue'
import TeamsView from '@/views/TeamsView.vue'
import AgentsView from '@/views/AgentsView.vue'
import InsightsView from '@/views/InsightsView.vue'
import CelebrationOverlay from '@/components/CelebrationOverlay.vue'

const { view, settingsOpen, isFullscreen, toggleFullscreen } = useBoardControls()
useWakeLock()

/** هدف التصدير: اللوحة كاملة بترويستها. */
const board = ref<HTMLElement | null>(null)
</script>

<template>
  <div
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
    <main class="flex-1 flex flex-col min-h-0">
      <Transition name="view" mode="out-in">
        <TeamsView v-if="view === 'teams'" key="teams" class="flex-1 flex flex-col min-h-0" />
        <AgentsView v-else-if="view === 'agents'" key="agents" class="flex-1 flex flex-col min-h-0" />
        <InsightsView v-else key="insights" class="flex-1 flex flex-col min-h-0" />
      </Transition>
    </main>

    <CelebrationOverlay />
  </div>
</template>
