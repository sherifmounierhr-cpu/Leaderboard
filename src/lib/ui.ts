/**
 * أنماط مشتركة لصفحة الإدارة — بدل ما كل مكوّن يعرّف FIELD بنفسه.
 * الاختلاف بين الأنواع في المقاس بس.
 */

/** حقل نص/اختيار بعرض كامل (المقاس الأساسي). */
export const FIELD =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2.5 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** نفس الحقل بحشو أصغر (نماذج مزدحمة). */
export const FIELD_SM =
  'w-full rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** حقل بعرض المحتوى (فلاتر في صف). */
export const FIELD_AUTO =
  'rounded-lg border border-card-border bg-page px-3 py-2 text-sm text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'
