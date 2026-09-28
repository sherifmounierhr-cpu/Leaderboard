import { afterEach, describe, expect, it } from 'vitest'
import {
  compact,
  currentQuarter,
  drivePhotoUrl,
  egp,
  millions,
  pctOf,
  percent,
  relativeTime,
  setNumberLocale,
} from '@/lib/format'

/**
 * التنسيق هو آخر حاجة بتتشاف على الشاشة، وغلطة فيه ما بتوقعش حاجة — بتعرض
 * رقم غلط وخلاص. الاختبارات دي بتثبّت السلوك المقصود، خصوصاً الأرقام
 * اللاتينية في المحلية العربية (لو رجعت هندية الشاشة الكبيرة تبقى صعبة
 * القراءة من بعيد).
 */

afterEach(() => setNumberLocale('ar'))

describe('الأرقام اللاتينية في المحلية العربية', () => {
  it('يختصر بالمليون العربي بأرقام لاتينية', () => {
    setNumberLocale('ar')
    const out = compact(11_800_000)
    expect(out).toContain('11.8')
    // أي رقم هندي (٠..٩) معناه إن وسم المحلية اتكسر
    expect(out).not.toMatch(/[٠-٩]/)
  })

  it('يستعمل الاختصار الإنجليزي بعد تبديل اللغة', () => {
    setNumberLocale('en')
    expect(compact(11_800_000)).toBe('11.8M')
  })

  it('يفرّغ ذاكرة المنسّقات عند تبديل اللغة فلا يعلق تنسيق قديم', () => {
    setNumberLocale('ar')
    const ar = egp(1_000_000)
    setNumberLocale('en')
    const en = egp(1_000_000)
    expect(ar).not.toBe(en)
    expect(ar).toContain('ج.م')
    expect(en).toContain('EGP')
  })
})

describe('millions', () => {
  it('رقم عشري واحد فوق المليون', () => {
    setNumberLocale('en')
    expect(millions(2_500_000)).toBe('2.5')
  })

  it('رقمان تحت المليون حتى لا يظهر 950 ألف كـ 0.9', () => {
    setNumberLocale('en')
    expect(millions(950_000)).toBe('0.95')
  })

  it('يتعامل مع القيم غير الرقمية كصفر بدل NaN على الشاشة', () => {
    setNumberLocale('en')
    expect(millions(null)).toBe('0')
    expect(millions('غير رقم')).toBe('0')
    expect(compact(undefined)).toBe('0')
    expect(percent('')).toBe('0%')
  })
})

describe('drivePhotoUrl', () => {
  it('يحوّل رابط Drive إلى رابط صورة مباشر', () => {
    expect(drivePhotoUrl('https://drive.google.com/file/d/ABC123_x-y/view?usp=sharing'))
      .toBe('https://lh3.googleusercontent.com/d/ABC123_x-y')
  })

  it('يترك أي رابط آخر كما هو', () => {
    const direct = 'https://example.com/photo.jpg'
    expect(drivePhotoUrl(direct)).toBe(direct)
  })

  it('يرجّع نصاً فارغاً للقيم الفارغة فتظهر الأحرف الأولى بدل صورة مكسورة', () => {
    expect(drivePhotoUrl(null)).toBe('')
    expect(drivePhotoUrl('   ')).toBe('')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-28T12:00:00Z')

  it('أقل من دقيقة تُقرأ «الآن» بدل عدّاد ثوانٍ متحرّك', () => {
    setNumberLocale('en')
    expect(relativeTime(new Date('2026-09-28T11:59:30Z'), now)).toBe('now')
  })

  it('يختار الوحدة المناسبة مع اتساع الفارق', () => {
    setNumberLocale('en')
    expect(relativeTime(new Date('2026-09-28T11:55:00Z'), now)).toBe('5 minutes ago')
    expect(relativeTime(new Date('2026-09-28T09:00:00Z'), now)).toBe('3 hours ago')
    expect(relativeTime(new Date('2026-09-26T12:00:00Z'), now)).toBe('2 days ago')
  })
})

describe('currentQuarter', () => {
  it('يحسب الربع من الشهر', () => {
    expect(currentQuarter(new Date(2026, 0, 15))).toBe(1)
    expect(currentQuarter(new Date(2026, 2, 31))).toBe(1)
    expect(currentQuarter(new Date(2026, 3, 1))).toBe(2)
    expect(currentQuarter(new Date(2026, 8, 28))).toBe(3)
    expect(currentQuarter(new Date(2026, 11, 31))).toBe(4)
  })
})

describe('pctOf', () => {
  it('يقرّب بنفس طريقة القاعدة', () => {
    expect(pctOf(11_800_000, 13_000_000)).toBe(91)
    expect(pctOf(1, 3)).toBe(33)
  })

  it('هدف صفر يعطي صفر لا قسمة على صفر', () => {
    expect(pctOf(5_000_000, 0)).toBe(0)
    expect(pctOf(0, 0)).toBe(0)
  })

  it('يسمح بتجاوز المئة لمن فاق هدفه', () => {
    expect(pctOf(15_000_000, 10_000_000)).toBe(150)
  })
})
