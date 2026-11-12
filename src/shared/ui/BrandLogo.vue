<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { activeTheme } from '@/composables/useSettings'

/**
 * شعار إيفرست. الملوّن للأسطح الفاتحة، والأبيض للغامقة (الترويسة، سطح
 * الهوية، والمظهر الليلي): تركواز الشعار على خلفية غامقة لا يُقرأ.
 * `auto` يتبع المظهر الحالي.
 */
const props = withDefaults(defineProps<{ tone?: 'color' | 'white' | 'auto' }>(), { tone: 'auto' })

const { t } = useI18n()
const BASE = import.meta.env.BASE_URL

const src = computed(() => {
  const white = props.tone === 'white' || (props.tone === 'auto' && activeTheme.value === 'midnight')
  return `${BASE}${white ? 'logo-white.png' : 'logo.png'}`
})
</script>

<template>
  <img :src="src" :alt="t('brand')" width="720" height="362" class="w-auto shrink-0 select-none" draggable="false" />
</template>
