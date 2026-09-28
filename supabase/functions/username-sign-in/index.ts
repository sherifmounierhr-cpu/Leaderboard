// username-sign-in — الدخول باسم المستخدم بدل البريد.
//
// الاسم يُترجَم إلى بريد هنا بمفتاح الخدمة، ثم الدخول العادي بالبريد وكلمة
// المرور، وترجع الجلسة للمتصفح (supabase.auth.setSession). البريد لا يُرسَل
// للمتصفح أبداً، والرد واحد سواء الاسم غير موجود أو كلمة المرور خطأ.
//
// تُنشر بـ verify_jwt=false: المستدعي لم يدخل بعد، والمفتاح المنشور ليس JWT.
// الحماية: كلمة المرور نفسها + قفل الاسم 15 دقيقة بعد 5 محاولات خاطئة.
//
//   POST /functions/v1/username-sign-in   { username, password }

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ALLOWED_ORIGINS: قائمة مفصولة بفواصل (مثال: https://board.example.com,https://x.vercel.app).
// غير مضبوطة = '*' كما كان، فالنشر ما يكسرش شيء قبل ضبطها.
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

const corsFor = (req: Request) => {
  const origin = req.headers.get('origin') ?? ''
  const allow = ALLOWED.length === 0 ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0]
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  }
}

const INVALID = 'بيانات الدخول غير صحيحة'
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/

// حد محاولات لكل IP: نافذة 10 دقائق، 20 محاولة. في الذاكرة فقط، فهو أفضل جهد
// (كل instance له عدّاده وبيتصفّر مع إعادة التشغيل) — مش بديل عن قفل الاسم.
const WINDOW_MS = 10 * 60_000
const MAX_PER_IP = 20
const hits = new Map<string, number[]>()

// نعدّ المحاولات الفاشلة فقط، عشان مكتب كامل وراء IP واحد ما يتقفلش بدخول ناجح
const recentFails = (ip: string) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.set(ip, recent)
  return recent
}
const tooMany = (ip: string) => recentFails(ip).length >= MAX_PER_IP
const recordFail = (ip: string) => {
  recentFails(ip).push(Date.now())
  if (hits.size > 5000) {
    const now = Date.now()
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= WINDOW_MS) hits.delete(k)
  }
}

Deno.serve(async (req) => {
  const CORS = corsFor(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
    })

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (tooMany(ip)) return json({ error: 'محاولات كثيرة — حاول لاحقاً' }, 429)

  let username = ''
  let password = ''
  try {
    const body = await req.json()
    username = String(body.username ?? '').trim().toLowerCase()
    password = String(body.password ?? '')
  } catch {
    return json({ error: INVALID }, 400)
  }
  if (!USERNAME_RE.test(username) || !password || password.length > 72) {
    recordFail(ip)
    return json({ error: INVALID }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: email, error: lookupErr } = await service.rpc('lb_svc_login_lookup', { p_username: username })
  if (lookupErr) {
    console.error('[username-sign-in] lookup', lookupErr.message)
    return json({ error: 'تعذّر الدخول الآن — حاول لاحقاً' }, 500)
  }
  // اسم غير موجود أو مقفول: نفس الرد، بدون محاولة
  if (!email) {
    recordFail(ip)
    return json({ error: INVALID }, 400)
  }

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({ email: email as string, password })

  await service.rpc('lb_svc_login_result', { p_username: username, p_ok: !error })

  if (error || !data.session) {
    recordFail(ip)
    const banned = /banned/i.test(error?.message ?? '')
    return json({ error: banned ? 'هذا الحساب موقوف — تواصل مع المسؤول' : INVALID }, 400)
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})
