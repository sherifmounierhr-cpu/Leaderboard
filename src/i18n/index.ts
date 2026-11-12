import { createI18n } from 'vue-i18n'
import type { LocaleName } from '@/lib/types'
import { setNumberLocale } from '@/lib/format'

/**
 * الإنجليزية أول ما تفتح اللوحة، حتى على جهاز اختار العربية قبل كده —
 * التبديل من الإعدادات يسري على الجلسة فقط. لتثبيت العربية على شاشة
 * بعينها: ?lang=ar في الرابط. لوحة الإدارة مختلفة: بتفتكر آخر اختيار.
 */
function initialLocale(): LocaleName {
  const query = new URLSearchParams(location.search)
  const fromQuery = query.get('lang')
  if (fromQuery === 'ar' || fromQuery === 'en') return fromQuery
  // لوحة الإدارة بتفتح بآخر لغة اختارها المسؤول (من اللوحة أو من زرار اللغة فيها)
  if (query.has('admin')) return savedLocale() ?? 'en'
  return 'en'
}

/**
 * النصوص ملف لكل قسم (locales/<لغة>/<قسم>.json) والاسم هو مفتاح القسم؛ بتتجمّع
 * هنا في كائن واحد لكل لغة. قسم جديد = ملف جديد في اللغتين.
 */
type Messages = Record<string, any>
function load(files: Record<string, unknown>): Messages {
  return Object.fromEntries(
    Object.entries(files)
      .map(([path, mod]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), mod] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}
const ar = load(import.meta.glob('./locales/ar/*.json', { eager: true, import: 'default' }))
const en = load(import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' }))

const SETTINGS_KEY = 'everest.settings'

function savedLocale(): LocaleName | null {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').locale
    return value === 'ar' || value === 'en' ? value : null
  } catch {
    return null
  }
}

/** يحفظ اللغة مع باقي إعدادات الجهاز، فتفضل بعد إعادة تحميل لوحة الإدارة. */
export function rememberLocale(locale: LocaleName) {
  try {
    const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...all, locale }))
  } catch {
    /* وضع التصفح الخاص */
  }
}

export const i18n = createI18n<[Messages], LocaleName, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { ar, en },
})

/** يطبّق اللغة على <html> (lang + dir) ويضبط محلية الأرقام. */
export function applyLocale(locale: LocaleName) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  setNumberLocale(locale)
}

applyLocale(i18n.global.locale.value as LocaleName)
