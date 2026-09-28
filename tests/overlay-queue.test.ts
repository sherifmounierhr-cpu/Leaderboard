import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  OVERLAY_ORDER,
  activeOverlay,
  resetOverlayQueue,
  useOverlayLayer,
  type OverlayLayer,
} from '@/composables/useOverlayQueue'

/**
 * الشاشات الخمسة اللي بتغطّي اللوحة لازم تتناوب، مش تتراكم. قبل الطابور ده
 * كانت كل واحدة بتسأل عن بعض التانيين بالاسم، فكان ممكن تلاتة يشتغلوا مع بعض
 * وz-index هو اللي يقرر مين فوق — والتلاتة بيرنّوا.
 *
 * الاختبارات دي بتثبّت القاعدة: واحدة بس في المرة، والأعلى أولوية بتكسب،
 * واللي تحتها بتستنى وتكمّل بعدين.
 */

/** يبني طبقة مربوطة بمفتاح تشغيل، زي ما المكوّن بيعمل بالظبط. */
function layer(name: OverlayLayer) {
  const wants = ref(false)
  const active = useOverlayLayer(name, wants)
  return {
    active,
    async want(value: boolean) {
      wants.value = value
      await nextTick()
    },
  }
}

beforeEach(() => resetOverlayQueue())

describe('الطابور — واحدة في المرة', () => {
  it('مفيش شاشة طالبة يعني مفيش شاشة ظاهرة', () => {
    expect(activeOverlay.value).toBeNull()
  })

  it('الشاشة الوحيدة الطالبة بتاخد الدور', async () => {
    const cast = layer('cast')
    await cast.want(true)
    expect(cast.active.value).toBe(true)
    expect(activeOverlay.value).toBe('cast')
  })

  it('لما كلهم يطلبوا مع بعض، واحدة بس بتظهر', async () => {
    const all = OVERLAY_ORDER.map((name) => ({ name, l: layer(name) }))
    for (const { l } of all) await l.want(true)
    expect(all.filter(({ l }) => l.active.value)).toHaveLength(1)
    expect(activeOverlay.value).toBe('celebration')
  })
})

describe('الأولوية', () => {
  it('الأعلى أولوية بتكسب مهما كان ترتيب الطلب', async () => {
    const market = layer('market')
    const celebration = layer('celebration')

    // التنبيه طلب الأول
    await market.want(true)
    expect(market.active.value).toBe(true)

    // الاحتفال نزل بعده وأخد الدور منه
    await celebration.want(true)
    expect(celebration.active.value).toBe(true)
    expect(market.active.value).toBe(false)
  })

  it('اللي استنّت بتكمّل لما اللي فوقها تخلص', async () => {
    const breaking = layer('breaking')
    const celebration = layer('celebration')

    await breaking.want(true)
    await celebration.want(true)
    expect(breaking.active.value).toBe(false)

    await celebration.want(false)
    expect(breaking.active.value).toBe(true)
    expect(activeOverlay.value).toBe('breaking')
  })

  it('الترتيب بيتبع OVERLAY_ORDER بالحرف', async () => {
    const built = OVERLAY_ORDER.map((name) => ({ name, l: layer(name) }))
    for (const { l } of built) await l.want(true)

    // كل ما الأعلى تخلص، اللي بعدها في القايمة تاخد الدور
    for (const { name, l } of built) {
      expect(activeOverlay.value).toBe(name)
      await l.want(false)
    }
    expect(activeOverlay.value).toBeNull()
  })
})

describe('الحالات اللي كانت بتكسر قبل الطابور', () => {
  it('الرسائل والبثّ والخبر العاجل ما بيظهروش مع بعض', async () => {
    const announcement = layer('announcement')
    const cast = layer('cast')
    const breaking = layer('breaking')

    await announcement.want(true)
    await cast.want(true)
    await breaking.want(true)

    // قبل كده التلاتة كانوا بيشتغلوا ويرنّوا مع بعض
    expect([announcement, cast, breaking].filter((l) => l.active.value)).toHaveLength(1)
    expect(announcement.active.value).toBe(true)
  })

  it('البثّ بيستنى الخبر العاجل؟ لأ — البثّ أعلى منه', async () => {
    const cast = layer('cast')
    const breaking = layer('breaking')

    await breaking.want(true)
    await cast.want(true)
    // البثّ مقصود من الإدارة، فهو أولى من خبر نزل لوحده
    expect(cast.active.value).toBe(true)
    expect(breaking.active.value).toBe(false)
  })

  it('شاشة سحبت طلبها وهي مستنّية ما بتعطّلش اللي بعدها', async () => {
    const celebration = layer('celebration')
    const cast = layer('cast')
    const market = layer('market')

    await celebration.want(true)
    await cast.want(true)
    await market.want(true)

    // البثّ اتلغى وهو مستنّي
    await cast.want(false)
    expect(activeOverlay.value).toBe('celebration')

    await celebration.want(false)
    expect(market.active.value).toBe(true)
  })
})

describe('ترتيب الأولوية نفسه', () => {
  it('مكتوب صراحةً فأي تغيير فيه يبقى مقصود', () => {
    expect([...OVERLAY_ORDER]).toEqual(['celebration', 'announcement', 'cast', 'breaking', 'market'])
  })
})
