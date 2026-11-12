<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAudioPlayer } from '@/composables/useAudioPlayer'
import { unlockChime } from '@/composables/useChime'

/**
 * يظهر فقط لما المتصفح يمنع صوت احتفال أو رسالة. ضغطة واحدة تفك المنع
 * وتكمّل الصوت. فوق الاحتفال نفسه حتى يتضغط وهو معروض.
 */
const { t } = useI18n()
const { blocked, unlock } = useAudioPlayer()

function enable() {
  unlockChime()
  void unlock()
}
</script>

<template>
  <button
    v-if="blocked"
    type="button"
    data-export-hide
    class="fixed bottom-[clamp(12px,2.5vh,28px)] start-1/2 z-[70] inline-flex -translate-x-1/2 rtl:translate-x-1/2 items-center gap-2 rounded-full bg-gold px-5 py-3 font-bold text-header shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] text-[clamp(14px,2vh,20px)] animate-pulse-dot hover:animate-none"
    @click.stop="enable"
  >
    <iconify-icon icon="mdi:volume-high" aria-hidden="true" class="text-[1.3em]" />
    {{ t('announce.enableSound') }}
  </button>
</template>
