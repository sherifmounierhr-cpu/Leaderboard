import { createApp } from 'vue'
import 'iconify-icon'
import './style.css'
import { i18n } from './i18n'
import App from './App.vue'
import AdminView from './views/AdminView.vue'

/**
 * لا router: صفحتان فقط تفصلهما علامة في الرابط.
 * الفصل هنا لا داخل App حتى لا تبدأ مؤقتات اللوحة (التدوير، Wake Lock،
 * إعادة التحميل اليومية) في صفحة الإدارة.
 */
const isAdminRoute = new URLSearchParams(location.search).has('admin')

createApp(isAdminRoute ? AdminView : App)
  .use(i18n)
  .mount('#app')
