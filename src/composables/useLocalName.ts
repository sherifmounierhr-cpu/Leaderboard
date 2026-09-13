import { useI18n } from 'vue-i18n'

/**
 * الاسم المعروض حسب اللغة الحالية، مع الرجوع للإنجليزية إن غاب العربي.
 * تفاعلي عمداً: تبديل اللغة يعيد رسم الأسماء بلا إعادة تحميل.
 *
 * للعرض فقط — مفاتيح الربط (التصدير، الاستيراد، تصفية الفرع) تبقى على
 * الاسم الإنجليزي لأنه ما تُطابَق به الصفوف في قاعدة البيانات.
 */
export function useLocalName() {
  const { locale } = useI18n()
  return (name: string, nameAr?: string | null): string =>
    locale.value === 'ar' && nameAr ? nameAr : name
}
