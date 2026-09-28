import { describe, expect, it } from 'vitest'
import { CLOSE_MARGIN, paceStatus, quarterProgress } from '@/composables/usePace'

/**
 * الإيقاع بيحدّد لون العلامة جنب كل فريق: سابق، قريب، متأخر. غلطة يوم واحد
 * في حساب الربع بتقلب العلامة دي على الشاشة قدام الناس، فالحدود هنا مختبرة
 * بالتحديد — أول يوم، آخر يوم، واليوم اللي بعده.
 *
 * كل التواريخ بتوقيت جرينتش عن قصد: الدالة بتحوّلها للقاهرة داخلياً، وده
 * بالظبط اللي عايزين نتأكد إنه بيحصل صح مهما كان توقيت الجهاز.
 */

// الربع الثالث 2026: يوليو + أغسطس + سبتمبر = 92 يوم
const Q3 = [2026, 3] as const

describe('quarterProgress — حدود الربع', () => {
  it('أول يوم في الربع محسوب كامل لا صفر', () => {
    const p = quarterProgress(...Q3, new Date('2026-07-01T09:00:00Z'))
    expect(p.state).toBe('current')
    expect(p.totalDays).toBe(92)
    expect(p.daysLeft).toBe(91)
    expect(p.elapsed).toBeCloseTo(1 / 92, 6)
  })

  it('آخر يوم في الربع يعطي إيقاع 100% وصفر أيام متبقية', () => {
    const p = quarterProgress(...Q3, new Date('2026-09-30T09:00:00Z'))
    expect(p.state).toBe('current')
    expect(p.elapsed).toBe(1)
    expect(p.daysLeft).toBe(0)
  })

  it('اليوم اللي بعد الربع بيبقى «منتهي»', () => {
    const p = quarterProgress(...Q3, new Date('2026-10-01T09:00:00Z'))
    expect(p.state).toBe('past')
    expect(p.elapsed).toBe(1)
  })

  it('ربع لسه ما بدأش بيبقى «قادم» بإيقاع صفر', () => {
    const p = quarterProgress(...Q3, new Date('2026-05-15T09:00:00Z'))
    expect(p.state).toBe('future')
    expect(p.elapsed).toBe(0)
    expect(p.daysLeft).toBe(92)
  })
})

describe('quarterProgress — التوقيت بالقاهرة لا بتوقيت الجهاز', () => {
  it('الساعة 11 مساءً بتوقيت جرينتش في 30 يونيو هي بالفعل أول يوليو في القاهرة', () => {
    // القاهرة +3 صيفاً: 2026-06-30T22:00Z = 2026-07-01 01:00 بالقاهرة
    const p = quarterProgress(...Q3, new Date('2026-06-30T22:00:00Z'))
    expect(p.state).toBe('current')
    expect(p.daysLeft).toBe(91)
  })

  it('الساعة 10 مساءً بتوقيت جرينتش في 30 يونيو لسه في الربع اللي قبله', () => {
    const p = quarterProgress(...Q3, new Date('2026-06-30T20:00:00Z'))
    expect(p.state).toBe('future')
  })
})

describe('quarterProgress — أطوال الأرباع', () => {
  it('الربع الأول 90 يوم في سنة عادية و91 في الكبيسة', () => {
    expect(quarterProgress(2026, 1, new Date('2026-02-15T09:00:00Z')).totalDays).toBe(90)
    expect(quarterProgress(2028, 1, new Date('2028-02-15T09:00:00Z')).totalDays).toBe(91)
  })

  it('الربع الرابع 92 يوم', () => {
    expect(quarterProgress(2026, 4, new Date('2026-11-15T09:00:00Z')).totalDays).toBe(92)
  })
})

describe('paceStatus', () => {
  it('الوصول للإيقاع أو تجاوزه = سابق', () => {
    expect(paceStatus(80, 80)).toBe('ahead')
    expect(paceStatus(95, 80)).toBe('ahead')
  })

  it('التأخر في حدود الهامش = قريب', () => {
    expect(paceStatus(79, 80)).toBe('close')
    expect(paceStatus(80 - CLOSE_MARGIN, 80)).toBe('close')
  })

  it('التأخر فوق الهامش = متأخر', () => {
    expect(paceStatus(80 - CLOSE_MARGIN - 1, 80)).toBe('behind')
    expect(paceStatus(0, 80)).toBe('behind')
  })

  it('في أول الربع حتى نسبة صغيرة تعتبر سابقة', () => {
    // 5% من المستهدف بعد 3% من الربع = الفريق قدّام الإيقاع
    expect(paceStatus(5, 3)).toBe('ahead')
  })
})
