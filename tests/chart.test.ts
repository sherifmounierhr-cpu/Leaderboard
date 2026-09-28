import { describe, expect, it } from 'vitest'
import { barPath, linePath, makeXScale, makeYScale, nearestIndex, niceScale } from '@/lib/chart'

/**
 * الرسوم مبنية بـSVG خام بلا مكتبة، يعني الرياضة دي هي الرسم نفسه. أي غلطة
 * فيها بتطلع شكل معقول بصرياً وقيمه غلط — وده أسوأ من رسم مكسور، لأن محدش
 * بيشك فيه.
 */

describe('niceScale', () => {
  it('يرجّع علامات بأرقام نظيفة تغطّي أعلى قيمة', () => {
    const { ticks, top } = niceScale(11_800_000, 4)
    expect(ticks).toEqual([0, 5_000_000, 10_000_000, 15_000_000])
    expect(top).toBe(15_000_000)
    expect(top).toBeGreaterThanOrEqual(11_800_000)
  })

  it('العلامة الأولى صفر دائماً فالمقارنة البصرية تبقى عادلة', () => {
    for (const max of [7, 250, 3_300, 91_000, 4_200_000]) {
      expect(niceScale(max).ticks[0]).toBe(0)
    }
  })

  it('آخر علامة هي الحد الأعلى بالظبط', () => {
    for (const max of [7, 250, 3_300, 91_000, 4_200_000]) {
      const { ticks, top } = niceScale(max)
      expect(ticks.at(-1)).toBe(top)
      expect(top).toBeGreaterThanOrEqual(max)
    }
  })

  it('العلامات متساوية المسافة بلا أخطاء عشرية', () => {
    const { ticks } = niceScale(3_300)
    const steps = ticks.slice(1).map((v, i) => v - ticks[i])
    for (const s of steps) expect(s).toBe(steps[0])
    // 0.30000000000000004 وأخواتها ما تظهرش على المحور
    for (const t of ticks) expect(String(t)).not.toMatch(/\.\d{6,}/)
  })

  it('بيانات فاضية أو سالبة ما بتكسرش المحور', () => {
    expect(niceScale(0)).toEqual({ ticks: [0], top: 1 })
    expect(niceScale(-5)).toEqual({ ticks: [0], top: 1 })
    expect(niceScale(Number.NaN)).toEqual({ ticks: [0], top: 1 })
  })
})

describe('makeXScale — اتجاه الزمن يتبع اتجاه الصفحة', () => {
  const domain: [number, number] = [0, 100]
  const range: [number, number] = [50, 250]

  it('في LTR الزمن يمضي من اليسار لليمين', () => {
    const x = makeXScale(domain, range, false)
    expect(x(0)).toBe(50)
    expect(x(50)).toBe(150)
    expect(x(100)).toBe(250)
  })

  it('في RTL الزمن يمضي من اليمين لليسار', () => {
    const x = makeXScale(domain, range, true)
    expect(x(0)).toBe(250)
    expect(x(50)).toBe(150)
    expect(x(100)).toBe(50)
  })

  it('نقطة واحدة (مدى صفري) ما بتقسمش على صفر', () => {
    const x = makeXScale([7, 7], range, false)
    expect(Number.isFinite(x(7))).toBe(true)
  })
})

describe('makeYScale — القيم الأكبر أعلى', () => {
  // [أسفل، أعلى] بالبكسل: محور SVG يزداد نزولاً
  const y = makeYScale([0, 100], [300, 20])

  it('الصفر عند القاع والحد الأعلى عند القمة', () => {
    expect(y(0)).toBe(300)
    expect(y(100)).toBe(20)
  })

  it('القيمة الأكبر ترسم أعلى (رقم بكسل أصغر)', () => {
    expect(y(80)).toBeLessThan(y(20))
  })
})

describe('linePath', () => {
  it('يبدأ بـM ويكمّل بـL بلا تنعيم', () => {
    const d = linePath([{ x: 0, y: 10 }, { x: 5, y: 20 }, { x: 10, y: 0 }])
    expect(d).toBe('M0.00,10.00 L5.00,20.00 L10.00,0.00')
    // أي C أو Q معناها تنعيم، والتنعيم بيخترع قيم بين النقاط
    expect(d).not.toMatch(/[CQS]/)
  })

  it('قائمة فاضية تعطي مساراً فاضياً لا "M undefined"', () => {
    expect(linePath([])).toBe('')
  })
})

describe('barPath', () => {
  it('يبدأ من نقطة البداية وينتهي بإغلاق المسار', () => {
    const d = barPath(10, 20, 100, 30)
    expect(d.startsWith('M10,20')).toBe(true)
    expect(d.trim().endsWith('z')).toBe(true)
  })

  it('القضيب المقلوب يبدأ من الطرف الآخر (وضع RTL)', () => {
    expect(barPath(10, 20, 100, 30, 4, true).startsWith('M110,20')).toBe(true)
  })

  it('عرض صفر أو سالب يعطي مساراً لا يرسم شيئاً بدل شكل مقلوب', () => {
    expect(barPath(10, 20, 0, 30)).toBe('M10,20h0v30h0z')
    expect(barPath(10, 20, -5, 30)).toBe('M10,20h-5v30h5z')
  })

  it('نصف القطر ما بيتعداش نصف الارتفاع فالقضيب القصير ما يبقاش دائرة', () => {
    // ارتفاع 4 ونصف قطر مطلوب 4 → يتقلّم لـ2
    expect(barPath(0, 0, 50, 4, 4)).toContain('a2,2')
  })
})

describe('nearestIndex', () => {
  const xs = [0, 25, 50, 75, 100]

  it('يلاقي أقرب نقطة أفقياً', () => {
    expect(nearestIndex(xs, 0)).toBe(0)
    expect(nearestIndex(xs, 30)).toBe(1)
    expect(nearestIndex(xs, 60)).toBe(2)
    expect(nearestIndex(xs, 99)).toBe(4)
  })

  it('يثبت على الطرفين لو المؤشر خرج بره الرسم', () => {
    expect(nearestIndex(xs, -500)).toBe(0)
    expect(nearestIndex(xs, 5_000)).toBe(4)
  })

  it('عند التعادل يختار الأولى فالـtooltip ما يرفرفش بين نقطتين', () => {
    expect(nearestIndex([10, 30], 20)).toBe(0)
  })
})
