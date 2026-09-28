/**
 * ردّ مختصر يشبه `wp/v2/posts?per_page=10&_embed` بالحالات اللي وقعتنا فعلاً:
 * كيانات HTML مكوّدة مرتين، ذيل «متابعة القراءة»، عنوان مكرّر في أول المقتطف،
 * مقاسات صور بأحجام مختلفة، صورة مفقودة، ومقال بلا slug.
 *
 * مش نسخة من ردّ حقيقي — مكتوب بإيد عشان كل حقل فيه بيختبر حاجة معيّنة.
 */
export const WP_POSTS: unknown[] = [
  {
    id: 7649,
    slug: 'new-capital-launch',
    date: '2026-09-27T10:00:00',
    date_gmt: '2026-09-27T08:00:00',
    title: { rendered: 'إيفرست تطلق &#8220;بروج&#8221; في العاصمة' },
    excerpt: {
      rendered:
        '<p>إيفرست تطلق “بروج” في العاصمة — المشروع بيضم 300 وحدة سكنية على مساحة عشرين فدان، وبيستهدف شريحة الأسر الشابة اللي بتدور على وحدات متوسطة المساحة بأسعار تنافسية في قلب العاصمة الإدارية الجديدة وقريب من الحي المالي. [&hellip;]</p>',
    },
    _embedded: {
      'wp:featuredmedia': [
        {
          source_url: 'https://dashboard.everest-realestate.net/wp-content/uploads/borouj.png',
          media_details: {
            width: 4000,
            filesize: 3_500_000,
            sizes: {
              medium: {
                source_url: 'https://dashboard.everest-realestate.net/wp-content/uploads/borouj-300x200.png',
                width: 300,
                filesize: 40_000,
              },
              large: {
                source_url: 'https://dashboard.everest-realestate.net/wp-content/uploads/borouj-1024x683.png',
                width: 1024,
                filesize: 900_000,
              },
              full: {
                source_url: 'https://dashboard.everest-realestate.net/wp-content/uploads/borouj.png',
                width: 4000,
                // ووردبريس بيسيب filesize فاضي في مقاس full — الحجم على الأصل
              },
            },
          },
        },
      ],
    },
  },
  {
    id: 7646,
    slug: 'سوق-العقارات',
    date: '2026-09-26T09:30:00',
    date_gmt: '2026-09-26T07:30:00',
    title: { rendered: 'تقرير السوق &amp;#8211; سبتمبر' },
    excerpt: { rendered: '<p>ملخّص بسيط.</p>\n' },
    _embedded: {
      // صورة مطلوبة وما جتش: ووردبريس بيرجّع كائن فيه code بدل الصورة
      'wp:featuredmedia': [{ code: 'rest_forbidden' }],
    },
  },
  {
    id: 7600,
    slug: '',
    title: { rendered: 'مقال بلا slug' },
    excerpt: { rendered: 'لا يُعرض لأن الرابط مش هيتبني صح.' },
  },
  {
    id: 7599,
    slug: 'no-title',
    title: { rendered: '   ' },
    excerpt: { rendered: 'لا يُعرض: عنوان فاضي على الشاشة أسوأ من لا شيء.' },
  },
]
