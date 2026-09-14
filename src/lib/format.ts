import type { LocaleName } from './types'

/**
 * لغة التنسيق الحالية. تُضبط من i18n عند تبديل اللغة حتى تتبع كل الأرقام
 * في اللوحة نفس المحلية دون تمريرها في كل نداء.
 */
let activeLocale: LocaleName = 'ar'

/** ar-EG بأرقام لاتينية: أوضح على شاشات العرض من الأرقام الهندية. */
const LOCALE_TAG: Record<LocaleName, string> = {
  ar: 'ar-EG-u-nu-latn',
  en: 'en-US',
}

export function setNumberLocale(locale: LocaleName) {
  activeLocale = locale
  compactCache.clear()
  fullCache.clear()
  timeCache.clear()
  dateCache.clear()
}

const compactCache = new Map<string, Intl.NumberFormat>()
const fullCache = new Map<string, Intl.NumberFormat>()
const timeCache = new Map<string, Intl.DateTimeFormat>()
const dateCache = new Map<string, Intl.DateTimeFormat>()

function compactFormatter() {
  const tag = LOCALE_TAG[activeLocale]
  let f = compactCache.get(tag)
  if (!f) {
    f = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 })
    compactCache.set(tag, f)
  }
  return f
}

function fullFormatter() {
  const tag = LOCALE_TAG[activeLocale]
  let f = fullCache.get(tag)
  if (!f) {
    f = new Intl.NumberFormat(tag)
    fullCache.set(tag, f)
  }
  return f
}

/** رقم مختصر للعرض الكبير: 11.8M */
export function compact(value: unknown): string {
  return compactFormatter().format(Number(value) || 0)
}

/** المبلغ كاملاً مع العملة — يُستخدم في الـ tooltip وقارئ الشاشة. */
export function egp(value: unknown): string {
  const n = fullFormatter().format(Number(value) || 0)
  return activeLocale === 'ar' ? `${n} ج.م` : `${n} EGP`
}

/** نسبة مئوية بصيغة المحلية الحالية. */
export function percent(value: unknown): string {
  return `${fullFormatter().format(Number(value) || 0)}%`
}

/**
 * يحوّل رابط Google Drive إلى رابط صورة قابل للعرض.
 * المزامنة تفعل هذا على الخادم، لكن نبقيه احتياطاً للبيانات القديمة.
 */
export function drivePhotoUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : raw
}

/** الساعة والدقيقة بمحلية العرض — أرقام لاتينية في العربية كبقية اللوحة. */
export function clockTime(date: Date): string {
  const tag = LOCALE_TAG[activeLocale]
  let f = timeCache.get(tag)
  if (!f) {
    // hour: 'numeric' لا '2-digit': بنظام 12 ساعة تُقرأ «2:35 م» لا «02:35 م»
    f = new Intl.DateTimeFormat(tag, { hour: 'numeric', minute: '2-digit' })
    timeCache.set(tag, f)
  }
  return f.format(date)
}

/** اليوم والتاريخ كاملاً: «الأحد، ١٣ سبتمبر ٢٠٢٦» بأرقام لاتينية. */
export function clockDate(date: Date): string {
  const tag = LOCALE_TAG[activeLocale]
  let f = dateCache.get(tag)
  if (!f) {
    f = new Intl.DateTimeFormat(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    dateCache.set(tag, f)
  }
  return f.format(date)
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', Infinity],
]

/** «منذ 5 دقائق» / «5 minutes ago» — للإشعارات. */
export function relativeTime(date: Date, now = new Date()): string {
  let value = (date.getTime() - now.getTime()) / 1000
  const f = new Intl.RelativeTimeFormat(LOCALE_TAG[activeLocale], { numeric: 'auto' })
  // أقل من دقيقة تُقرأ «الآن» بدل عدّاد ثوانٍ يتغيّر أمام العين
  if (Math.abs(value) < 60) return f.format(0, 'second')
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return f.format(Math.round(value), unit)
    value /= size
  }
  return f.format(Math.round(value), 'week')
}

/** الربع التقويمي الحالي (1..4). */
export function currentQuarter(date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1
}

/** يحسب النسبة المئوية بنفس تقريب قاعدة البيانات. */
export function pctOf(deals: number, target: number): number {
  return target > 0 ? Math.round((deals / target) * 100) : 0
}
