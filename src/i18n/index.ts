import { createI18n } from 'vue-i18n'
import ar from './ar.json'
import en from './en.json'
import type { LocaleName } from '@/lib/types'
import { setNumberLocale } from '@/lib/format'

/**
 * الإنجليزية أول ما تفتح اللوحة، حتى على جهاز اختار العربية قبل كده —
 * التبديل من الإعدادات يسري على الجلسة فقط. لتثبيت العربية على شاشة
 * بعينها: ?lang=ar في الرابط.
 */
function initialLocale(): LocaleName {
  const fromQuery = new URLSearchParams(location.search).get('lang')
  if (fromQuery === 'ar' || fromQuery === 'en') return fromQuery
  return 'en'
}

export const i18n = createI18n({
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
