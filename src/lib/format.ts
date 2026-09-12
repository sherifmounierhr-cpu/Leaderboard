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
}

const compactCache = new Map<string, Intl.NumberFormat>()
const fullCache = new Map<string, Intl.NumberFormat>()

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

/** الربع التقويمي الحالي (1..4). */
export function currentQuarter(date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1
}

/** يحسب النسبة المئوية بنفس تقريب قاعدة البيانات. */
export function pctOf(deals: number, target: number): number {
  return target > 0 ? Math.round((deals / target) * 100) : 0
}
