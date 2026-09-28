import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkPwnedPassword } from '@/lib/pwnedPassword'

/**
 * فحص كلمة المرور مقابل تسريبات Have I Been Pwned.
 *
 * أهم حاجة هنا مش «بيلاقي المسرَّبة؟» — دي سهلة. الأهم إن **كلمة المرور
 * نفسها ولا بصمتها الكاملة عمرهم ما يخرجوا على الشبكة**. لو حد عدّل الدالة
 * بعدين وبعت البصمة كاملة، الفحص هيفضل شغّال تمام وإحنا بنسرّب كلمات مرور
 * المسؤولين لطرف تالت من غير ما حد ياخد باله.
 */

// بصمة SHA-1 لـ"Password123" (معروفة ومتسرّبة فعلاً)
const PW = 'Password123'
const HASH = 'B2E98AD6F6EB8508DD6A14CFA704BAD7F05F6FB1'
const PREFIX = HASH.slice(0, 5)
const SUFFIX = HASH.slice(5)

afterEach(() => vi.unstubAllGlobals())

/** يردّ ردّ HIBP ويسجّل الروابط اللي اتطلبت. */
function stubHibp(body: string, ok = true) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url))
    return { ok, text: async () => body } as Response
  }))
  return calls
}

describe('خصوصية الفحص', () => {
  it('بيبعت أول 5 حروف من البصمة بس', async () => {
    const calls = stubHibp(`${SUFFIX}:1505362\r\n`)
    await checkPwnedPassword(PW)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`)
  })

  it('لا كلمة المرور ولا البصمة الكاملة بتخرج على الشبكة', async () => {
    const calls = stubHibp(`${SUFFIX}:1505362\r\n`)
    await checkPwnedPassword(PW)

    const sent = calls.join(' ')
    expect(sent).not.toContain(PW)
    expect(sent).not.toContain(HASH)
    expect(sent).not.toContain(SUFFIX)
  })
})

describe('النتيجة', () => {
  it('بيلاقي كلمة المرور المسرَّبة ويرجّع عدد مرّاتها', async () => {
    stubHibp(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:1505362\r\n`)
    const result = await checkPwnedPassword(PW)

    expect(result).toEqual({ checked: true, pwned: true, count: 1505362 })
  })

  it('كلمة مرور مش في القايمة بتعدّي', async () => {
    stubHibp('0018A45C4D1DEF81644B54AB7F969B88D65:1\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:9\r\n')
    const result = await checkPwnedPassword(PW)

    expect(result).toEqual({ checked: true, pwned: false, count: 0 })
  })

  it('المقارنة مش حسّاسة لمسافات آخر السطر', async () => {
    // HIBP بيردّ بـCRLF؛ من غير trim السطر ما بيطابقش
    stubHibp(`${SUFFIX}:42\r\n`)
    expect(await checkPwnedPassword(PW)).toMatchObject({ pwned: true, count: 42 })
  })
})

describe('لما الفحص نفسه ما يتمّش', () => {
  it('ردّ فاشل من HIBP = «ما اتفحصتش» مش «نضيفة»', async () => {
    stubHibp('', false)
    expect(await checkPwnedPassword(PW)).toEqual({ checked: false })
  })

  it('الشبكة قاطعة = «ما اتفحصتش»، والتغيير ما بيتمنعش', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await checkPwnedPassword(PW)).toEqual({ checked: false })
  })

  it('«ما اتفحصتش» مختلفة عن «مش مسرَّبة» — والمستدعي لازم يفرّق', async () => {
    stubHibp('', false)
    const result = await checkPwnedPassword(PW)
    // `result.pwned` مش موجودة أصلاً هنا، فالشرط `checked && pwned` هو الصح
    expect('pwned' in result).toBe(false)
  })
})
