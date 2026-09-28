import { describe, expect, it } from 'vitest'
import { plainText, postsToNews } from '@/lib/news'
import { WP_POSTS } from './fixtures/wp-posts'

/**
 * تنظيف الأخبار هو أكتر جزء بيتعامل مع مدخل مش تحت سيطرتنا: المدونة ممكن
 * تغيّر شكل ردها في أي وقت. الاختبارات دي بتثبّت إن الحالات الغريبة اللي
 * قابلناها بتتعالج، وإن المقال الناقص بيتشال بدل ما يعرض صف مكسور على الشاشة.
 */

describe('plainText', () => {
  it('يشيل الوسوم ويرتّب المسافات', () => {
    expect(plainText('<p>سطر  أول</p>\n<p>سطر تاني</p>')).toBe('سطر أول سطر تاني')
  })

  it('يشيل محتوى script وstyle مش الوسوم بس', () => {
    expect(plainText('<p>خبر</p><script>alert("x")</script>')).toBe('خبر')
    expect(plainText('<style>p{color:red}</style><p>خبر</p>')).toBe('خبر')
  })

  it('يفكّ الكيانات المكوّدة مرتين', () => {
    // &amp;#8220; = اقتباس مكوّد مرتين، بيحصل في عناوين ووردبريس
    expect(plainText('عنوان &amp;#8220;مقتبس&amp;#8221;')).toBe('عنوان “مقتبس”')
  })

  it('يفكّ الكيانات المسمّاة والعشرية والست عشرية', () => {
    expect(plainText('&laquo;تجربة&raquo; &amp; &#1605;&#x631;&#x62d;&#x628;&#x627;'))
      .toBe('«تجربة» & مرحبا')
  })

  it('يترك أي كيان مجهول كما هو بدل ما يبلعه', () => {
    expect(plainText('&notarealentity; باقي')).toBe('&notarealentity; باقي')
  })

  it('يبدّل ذيل متابعة القراءة بنقاط', () => {
    expect(plainText('<p>ملخّص المقال [&hellip;]</p>')).toBe('ملخّص المقال…')
    expect(plainText('<p>ملخّص المقال [...]</p>')).toBe('ملخّص المقال…')
  })
})

describe('postsToNews', () => {
  const items = postsToNews(WP_POSTS)

  it('يشيل المقال اللي مالوش slug أو عنوان', () => {
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id)).toEqual([7649, 7646])
  })

  it('يبني الرابط من slug لا من حقل link القديم', () => {
    expect(items[0].url).toBe('https://everest-realestate.net/blog/new-capital-launch/')
  })

  it('يحافظ على الـ slug العربي كما هو فالمتصفح يكوّده وقت الفتح', () => {
    expect(items[1].url).toBe('https://everest-realestate.net/blog/سوق-العقارات/')
  })

  it('يستعمل date_gmt بعلامة Z فالتاريخ يُقرأ كتوقيت عالمي لا محلي', () => {
    expect(items[0].date).toBe('2026-09-27T08:00:00Z')
  })

  it('يشيل العنوان المكرّر من أول المقتطف', () => {
    expect(items[0].excerpt.startsWith('المشروع بيضم')).toBe(true)
  })

  it('يقصّ المقتطف على حدود كلمة لا في نص كلمة', () => {
    const { excerpt } = items[0]
    expect(excerpt.length).toBeLessThanOrEqual(181)
    expect(excerpt.endsWith('…')).toBe(true)
    // القطع الأعمى بيسيب مسافة قبل النقاط أو نص كلمة
    expect(excerpt).not.toMatch(/\s…$/)
  })

  it('يترك المقتطف القصير من غير قصّ', () => {
    expect(items[1].excerpt).toBe('ملخّص بسيط.')
  })
})

describe('اختيار الصورة', () => {
  const [first, second] = postsToNews(WP_POSTS)

  it('يتخطّى الأصل الأتقل من الميزانية ويختار أعرض نسخة مسموحة', () => {
    // الأصل 3.5 ميجا (فوق حد الـ2)، فبياخد large بـ900 كيلو
    expect(first.image).toContain('borouj-1024x683.png')
  })

  it('يختار للمصغّرة أول نسخة بعرض كافٍ لا أصغر واحدة', () => {
    // medium عرضها 300 — أقل من الحد، فبيطلع لـ1024
    expect(first.thumb).toContain('borouj-1024x683.png')
  })

  it('يرجّع null لما الصورة نفسها ترجع خطأ بدل ما يبني <img> مكسورة', () => {
    expect(second.image).toBeNull()
    expect(second.thumb).toBeNull()
  })
})

describe('المدخلات التالفة', () => {
  it('أي شيء غير مصفوفة يرجّع قائمة فاضية بدل ما يرمي', () => {
    expect(postsToNews(null)).toEqual([])
    expect(postsToNews({ error: 'nope' })).toEqual([])
    expect(postsToNews('<html>Just a moment…</html>')).toEqual([])
  })

  it('مقال فاضي تماماً بيتشال بدل ما يوقع التحويل كله', () => {
    expect(postsToNews([{}, null, { slug: 'ok', title: { rendered: 'عنوان' } }]))
      .toHaveLength(1)
  })
})
