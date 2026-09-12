/**
 * فحص كلمة المرور مقابل قاعدة كلمات المرور المسرَّبة (Have I Been Pwned)،
 * بديل مجاني عن ميزة Supabase Pro المدفوعة لنفس الغرض. يستخدم نموذج
 * k-anonymity: يُرسَل أول 5 أحرف فقط من بصمة SHA-1 لكلمة المرور، فلا
 * تُرسَل كلمة المرور ولا بصمتها الكاملة عبر الشبكة أبداً.
 * https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export type PwnedCheckResult =
  | { checked: true; pwned: boolean; count: number }
  | { checked: false }

export async function checkPwnedPassword(password: string): Promise<PwnedCheckResult> {
  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    })
    if (!res.ok) return { checked: false }

    const body = await res.text()
    for (const line of body.split('\n')) {
      const [lineSuffix, countText] = line.trim().split(':')
      if (lineSuffix === suffix) {
        return { checked: true, pwned: true, count: Number(countText) || 0 }
      }
    }
    return { checked: true, pwned: false, count: 0 }
  } catch {
    // فشل الشبكة لا يجب أن يمنع تغيير كلمة المرور بالكامل — يُعرض تحذير فقط
    return { checked: false }
  }
}
