<script setup lang="ts">
import DirectorsAdmin from './DirectorsAdmin.vue'
import ManagerCutoutsAdmin from './ManagerCutoutsAdmin.vue'

/** تبويب «مدراء الشركة» (مجموعة الأشخاص): قائمة المدراء وصور الـ cutout بتاعة مديري الفرق. */
</script>

<template>
  <div class="flex flex-col gap-6">
    <DirectorsAdmin />
    <ManagerCutoutsAdmin />
  </div>
</template>
