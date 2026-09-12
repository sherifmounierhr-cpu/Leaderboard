import { createI18n } from 'vue-i18n'
import ar from './ar.json'
import en from './en.json'
import type { LocaleName } from '@/lib/types'
import { setNumberLocale } from '@/lib/format'

const STORAGE_KEY = 'everest.locale'

function initialLocale(): LocaleName {
  const fromQuery = new URLSearchParams(location.search).get('lang')
  if (fromQuery === 'ar' || fromQuery === 'en') return fromQuery
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'ar' || stored === 'en') return stored
  return 'ar'
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
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* وضع التصفح الخاص */
  }
}

applyLocale(i18n.global.locale.value as LocaleName)
