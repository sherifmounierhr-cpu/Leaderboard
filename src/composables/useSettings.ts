import { reactive, watch } from 'vue'
import type { LocaleName, ThemeName } from '@/lib/types'
import { applyLocale, i18n } from '@/i18n'

const STORAGE_KEY = 'everest.settings'

export const ROTATE_INTERVALS = [10, 15, 30, 60] as const

interface Settings {
  theme: ThemeName
  rotate: boolean
  rotateSeconds: number
  keepAwake: boolean
  locale: LocaleName
}

const query = new URLSearchParams(location.search)

function stored(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function initial(): Settings {
  const saved = stored()
  const qTheme = query.get('theme')
  const qRotate = query.get('rotate')

  return {
    // الـ query string يتفوق على المحفوظ — يسمح بتثبيت إعدادات شاشة عرض في الرابط
    theme: qTheme === 'daylight' || qTheme === 'midnight' ? qTheme : (saved.theme ?? 'daylight'),
    rotate: qRotate === 'on' || qRotate === '1' ? true : (saved.rotate ?? false),
    rotateSeconds: Number(query.get('interval')) || saved.rotateSeconds || 15,
    keepAwake: saved.keepAwake ?? true,
    locale: (i18n.global.locale.value as LocaleName) ?? 'ar',
  }
}

export const settings = reactive<Settings>(initial())

/** وضع الكشك: يخفي كل عناصر التحكم للعرض النظيف على الشاشات. */
export const isKiosk = query.get('kiosk') === '1'

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme)
}

applyTheme(settings.theme)
if (isKiosk) document.documentElement.setAttribute('data-kiosk', '1')

watch(
  () => settings.theme,
  (theme) => applyTheme(theme),
)

watch(
  () => settings.locale,
  (locale) => applyLocale(locale),
)

watch(
  settings,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      /* وضع التصفح الخاص */
    }
  },
  { deep: true },
)

export function useSettings() {
  return {
    settings,
    isKiosk,
    toggleTheme: () => {
      settings.theme = settings.theme === 'daylight' ? 'midnight' : 'daylight'
    },
    toggleLocale: () => {
      settings.locale = settings.locale === 'ar' ? 'en' : 'ar'
    },
  }
}
