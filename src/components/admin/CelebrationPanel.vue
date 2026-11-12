<script setup lang="ts">
import CelebrateAdmin from './CelebrateAdmin.vue'
import QuarterCelebrateAdmin from './QuarterCelebrateAdmin.vue'
import CelebrationSettings from './CelebrationSettings.vue'
import MediaLibrary from './MediaLibrary.vue'

/** تبويب «الاحتفالات»: التهنئة وختام الربع والإعدادات جنب مكتبة الصوت. */
</script>

<template>
  <div class="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
    <div class="flex flex-col gap-6">
      <CelebrateAdmin />
      <QuarterCelebrateAdmin />
      <CelebrationSettings />
    </div>
    <MediaLibrary />
  </div>
</template>
