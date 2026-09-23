import { reactive, ref, watch } from 'vue'
import type { LocaleName, ThemeName, ThemePreference } from '@/lib/types'
import { applyLocale, i18n } from '@/i18n'

const STORAGE_KEY = 'everest.settings'

export const ROTATE_INTERVALS = [10, 15, 30, 60] as const

/** حدود النهار في الوضع التلقائي: نهاري من 6 صباحاً حتى 6 مساءً. */
export const DAY_STARTS_AT = 6
export const DAY_ENDS_AT = 18

/** كم مرة نراجع الساعة في الوضع التلقائي — دقيقة تكفي لتبديل عند حدّ الساعة. */
const THEME_TICK_MS = 60_000

interface Settings {
  /** نغمة التنبيه مع كل جديد على الشاشة. */
  chime: boolean
  theme: ThemePreference
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
    theme:
      qTheme === 'daylight' || qTheme === 'midnight' || qTheme === 'auto'
        ? qTheme
        : (saved.theme ?? 'daylight'),
    rotate: qRotate === 'on' || qRotate === '1' ? true : (saved.rotate ?? false),
    rotateSeconds: Number(query.get('interval')) || saved.rotateSeconds || 15,
    keepAwake: saved.keepAwake ?? true,
    chime: saved.chime ?? true,
    locale: (i18n.global.locale.value as LocaleName) ?? 'ar',
  }
}

export const settings = reactive<Settings>(initial())

/** وضع الكشك: يخفي كل عناصر التحكم للعرض النظيف على الشاشات. */
export const isKiosk = query.get('kiosk') === '1'

/** المظهر الساري فعلاً بعد حلّ 'auto' — تقرؤه الواجهة لتعليم الخيار النشط. */
export const activeTheme = ref<ThemeName>('daylight')

export function resolveTheme(pref: ThemePreference, now = new Date()): ThemeName {
  if (pref !== 'auto') return pref
  const hour = now.getHours()
  return hour >= DAY_STARTS_AT && hour < DAY_ENDS_AT ? 'daylight' : 'midnight'
}

export function applyTheme(pref: ThemePreference) {
  const theme = resolveTheme(pref)
  activeTheme.value = theme
  document.documentElement.setAttribute('data-theme', theme)
}

applyTheme(settings.theme)
if (isKiosk) document.documentElement.setAttribute('data-kiosk', '1')

watch(
  () => settings.theme,
  (theme) => applyTheme(theme),
)

// الوضع التلقائي يحتاج مراجعة دورية: الشاشة تبقى مفتوحة ليوم كامل فيمر عليها
// حدّ الصباح والمساء دون أي تفاعل من أحد.
setInterval(() => {
  if (settings.theme === 'auto') applyTheme('auto')
}, THEME_TICK_MS)

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

const THEME_CYCLE: ThemePreference[] = ['daylight', 'midnight', 'auto']

export function useSettings() {
  return {
    settings,
    isKiosk,
    activeTheme,
    // اختصار D يدور على الثلاثة، وإلا لما أمكن الوصول للتلقائي من لوحة المفاتيح
    toggleTheme: () => {
      const next = (THEME_CYCLE.indexOf(settings.theme) + 1) % THEME_CYCLE.length
      settings.theme = THEME_CYCLE[next]
    },
    toggleLocale: () => {
      settings.locale = settings.locale === 'ar' ? 'en' : 'ar'
    },
  }
}
