import { describe, expect, it } from 'vitest'
import { CURRENCY, NUMBER_LOCALE, TIME_ZONE, dayKey, dayParts } from '@/lib/region'

/**
 * «النهارده» في اللوحة محسوبة بتوقيت العمل مش بتوقيت الجهاز. الفرق بيبان
 * ساعتين أو تلاتة كل ليلة — وفي الساعات دي، يوم غلط معناه إيقاع غلط، وخبر
 * النهارده يتحسب امبارح، ومفتاح تنبيه يتكرّر.
 *
 * التواريخ هنا بتوقيت جرينتش عن قصد، عشان الاختبار يدي نفس النتيجة على أي جهاز.
 */

describe('dayKey', () => {
  it('يرجّع اليوم بصيغة YYYY-MM-DD', () => {
    expect(dayKey(new Date('2026-09-28T09:00:00Z'))).toBe('2026-09-28')
  })

  it('الليل بتوقيت جرينتش ممكن يكون بكرة في القاهرة', () => {
    // القاهرة +3 صيفاً: 22:00Z = 01:00 اليوم اللي بعده
    expect(dayKey(new Date('2026-09-28T22:00:00Z'))).toBe('2026-09-29')
    expect(dayKey(new Date('2026-09-28T20:00:00Z'))).toBe('2026-09-28')
  })

  it('يشتغل صح في الشتاء كمان (+2 بدل +3)', () => {
    // يناير: القاهرة +2، فـ22:00Z لسه نفس اليوم و23:00Z بكرة
    expect(dayKey(new Date('2026-01-15T21:00:00Z'))).toBe('2026-01-15')
    expect(dayKey(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-16')
  })

  it('يقلب الشهر والسنة صح', () => {
    expect(dayKey(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01')
  })

  it('من غير تاريخ بيستعمل دلوقتي', () => {
    expect(dayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('dayParts', () => {
  it('يرجّع الشهر من صفر فيتركّب في Date.UTC على طول', () => {
    expect(dayParts(new Date('2026-09-28T09:00:00Z'))).toEqual([2026, 8, 28])
    expect(dayParts(new Date('2026-01-01T09:00:00Z'))).toEqual([2026, 0, 1])
  })

  it('متّفق مع dayKey على نفس اللحظة', () => {
    for (const iso of [
      '2026-09-28T22:00:00Z',
      '2026-01-15T22:30:00Z',
      '2026-12-31T22:00:00Z',
      '2026-06-30T21:00:00Z',
    ]) {
      const [y, m, d] = dayParts(new Date(iso))
      const pad = (n: number) => String(n).padStart(2, '0')
      expect(`${y}-${pad(m + 1)}-${pad(d)}`).toBe(dayKey(new Date(iso)))
    }
  })
})

describe('حقائق المنطقة', () => {
  it('منطقة زمنية واحدة معروفة لـ Intl', () => {
    expect(TIME_ZONE).toBe('Africa/Cairo')
    expect(() => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })).not.toThrow()
  })

  it('لكل لغة عملة ووسم أرقام', () => {
    expect(CURRENCY.ar).toBe('ج.م')
    expect(CURRENCY.en).toBe('EGP')
    expect(NUMBER_LOCALE.ar).toBe('ar-EG-u-nu-latn')
    expect(NUMBER_LOCALE.en).toBe('en-US')
  })

  it('وسم العربي بيطلّع أرقام لاتينية مش هندية', () => {
    // 2026 بيتنسّق «2,026» بفاصل الآلاف، فالمقارنة بعد شيل الفواصل
    const out = new Intl.NumberFormat(NUMBER_LOCALE.ar).format(2026)
    expect(out).not.toMatch(/[٠-٩]/)
    expect(out.replace(/\D/g, '')).toBe('2026')
  })
})
