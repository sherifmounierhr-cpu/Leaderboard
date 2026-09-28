import type { LocaleName } from './types'

/**
 * حقائق المكان في ملف واحد: المنطقة الزمنية، العملة، ووسم الأرقام.
 *
 * كانت `'Africa/Cairo'` مكتوبة في تسع ملفات، ودالة «تاريخ النهارده بتوقيت
 * القاهرة» متكرّرة بنصّها خمس مرات. ما كانتش مشكلة وهي كده، بس هي بالظبط
 * الحاجة اللي بتوجع لما يتفتح فرع بره مصر: تسع أماكن لازم يتغيّروا مع بعض،
 * وواحد ينساه يبقى يوم فرق في حساب الإيقاع أو مفتاح تنبيه غلط.
 */

/** توقيت يوم العمل. كل «النهارده» في اللوحة محسوبة بيه، مش بتوقيت الجهاز. */
export const TIME_ZONE = 'Africa/Cairo'

/** رمز العملة حسب اللغة المعروضة. */
export const CURRENCY: Record<LocaleName, string> = {
  ar: 'ج.م',
  en: 'EGP',
}

/**
 * وسم تنسيق الأرقام. العربي بأرقام لاتينية عن قصد: أوضح على شاشة عرض
 * كبيرة تتقرا من بعيد.
 */
export const NUMBER_LOCALE: Record<LocaleName, string> = {
  ar: 'ar-EG-u-nu-latn',
  en: 'en-US',
}

/*
 * `en-CA` مش لغة العرض — هو أقصر طريق لـ`YYYY-MM-DD`، وده شكل المفتاح
 * اللي بنقارن بيه ونخزّنه. اللي بيتعرض على الشاشة بيتنسّق في `format.ts`.
 */
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** مفتاح اليوم `YYYY-MM-DD` بتوقيت العمل، مهما كان توقيت الجهاز. */
export function dayKey(date: Date = new Date()): string {
  return dayFormatter.format(date)
}

/**
 * نفس اليوم مفكوك: `[سنة، شهر 0..11، يوم]`.
 * الشهر من صفر عشان يتركّب في `Date.UTC` على طول.
 */
export function dayParts(date: Date = new Date()): [number, number, number] {
  const [y, m, d] = dayKey(date).split('-').map(Number)
  return [y, m - 1, d]
}
