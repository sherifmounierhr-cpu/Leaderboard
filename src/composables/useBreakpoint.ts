import { ref } from 'vue'

/** نفس حدّ `lg` في Tailwind: من عنده اللوحة بتتحوّل لتخطيط الشاشة الكبيرة. */
const query = window.matchMedia('(min-width: 1024px)')
export const isDesktop = ref(query.matches)
query.addEventListener('change', (event) => { isDesktop.value = event.matches })
