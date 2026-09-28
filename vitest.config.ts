import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * إعداد منفصل عن `vite.config.ts` عن قصد: إضافات البناء هناك (Tailwind، سياسة
 * أمان المحتوى، وسيط دوال التطوير) مالهاش لازمة في الاختبارات وبتبطّئها.
 *
 * الاختبارات بتغطّي المنطق الخالص — التنسيق، تنظيف الأخبار، حساب الإيقاع،
 * ورياضة الرسوم. دي الأجزاء اللي بتتكسر في صمت: غلطة فيها بتظهر رقم خطأ على
 * الشاشة، مش خطأ في الـ console.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    /*
     * متصفح وهمي مش node: الدوال الخالصة نفسها ما بتلمسش المتصفح، لكن سلسلة
     * الاستيراد بتعدّي على i18n اللي بيقرأ `location.search` وقت التحميل.
     * ده تشابك حقيقي في الكود — لحد ما يتفكّ، البيئة دي بتخلي الاختبار يشتغل
     * من غير ما نغيّر شكل المصدر عشان الاختبار.
     */
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    // التنسيق بيعتمد على Intl بمحليات عربية — Node بيشحن ICU كامل من نسخة 13
    globals: false,
  },
})
