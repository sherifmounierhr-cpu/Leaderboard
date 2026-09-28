import { createApp } from 'vue'
import 'iconify-icon'
import './style.css'
import { i18n } from './i18n'

/**
 * لا router: صفحتان فقط تفصلهما علامة في الرابط.
 * الفصل هنا لا داخل App حتى لا تبدأ مؤقتات اللوحة (التدوير، Wake Lock،
 * إعادة التحميل اليومية) في صفحة الإدارة.
 *
 * كل صفحة بتتحمّل لوحدها: شاشة المكتب كانت بتنزّل صفحة الإدارة بتبويباتها
 * الـ13 وهي عمرها ما هتفتحها، والعكس.
 */
const isAdminRoute = new URLSearchParams(location.search).has('admin')

/**
 * كل `import()` في جملة لوحده، مش في شرط ثلاثي: لما الاتنين بيبقوا في تعبير
 * واحد، Vite بيجمّع روابط التحميل المسبق للاتنين في قايمة واحدة، فصفحة
 * الإدارة تنزّل حزمة اللوحة كمان من غير لزوم.
 */
async function loadRoot() {
  if (isAdminRoute) return (await import('./views/AdminView.vue')).default
  return (await import('./App.vue')).default
}

void loadRoot().then((Root) => {
  createApp(Root).use(i18n).mount('#app')
})
