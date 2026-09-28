import { describe, expect, it } from 'vitest'
import { plainText as clientPlainText, postsToNews as clientPosts } from '@/lib/news'
import { plainText as serverPlainText, postsToNews as serverPosts } from '../api/news'
import { WP_POSTS } from './fixtures/wp-posts'

/**
 * حارس الازدواج.
 *
 * منطق تنظيف الأخبار مكتوب مرتين: في `src/lib/news.ts` للمتصفح، وفي
 * `api/news.ts` لدالة Vercel — لأن دالة Vercel ما بتقدرش تستورد من `src/`،
 * والتجربة علّمتنا إن استيراد ملف مجاور بيقع وقت التشغيل هناك.
 *
 * التكرار مقصود، لكن خطره إن واحدة تتعدّل والتانية لأ، فتطلع الشاشة خبر
 * منظّف بطريقة والإدارة بطريقة تانية. الاختبار ده بيقارن الناتج الكامل
 * للاتنين على نفس المدخل: أي تعديل في نسخة من غير التانية بيوقّعه فوراً.
 */

describe('نسختا تنظيف الأخبار متطابقتان', () => {
  it('نفس الناتج بالضبط على نفس الردّ', () => {
    expect(serverPosts(WP_POSTS)).toEqual(clientPosts(WP_POSTS))
  })

  it('نفس تنظيف النص في الحالات الحرجة', () => {
    const cases = [
      '<p>سطر  أول</p>\n<p>سطر تاني</p>',
      'عنوان &amp;#8220;مقتبس&amp;#8221;',
      '&laquo;تجربة&raquo; &amp; &#1605;&#x631;&#x62d;&#x628;&#x627;',
      '<p>ملخّص المقال [&hellip;]</p>',
      '&notarealentity; باقي',
      '<script>alert("x")</script>نص',
      '',
    ]
    for (const input of cases) {
      expect(serverPlainText(input), `اختلاف عند: ${input}`).toBe(clientPlainText(input))
    }
  })

  it('نفس التعامل مع المدخل التالف', () => {
    for (const bad of [null, undefined, {}, 'نص', 42]) {
      expect(serverPosts(bad)).toEqual(clientPosts(bad))
    }
  })
})
