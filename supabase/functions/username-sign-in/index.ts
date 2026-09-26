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

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  })

const INVALID = 'بيانات الدخول غير صحيحة'
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

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
  if (!email) return json({ error: INVALID }, 400)

  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({ email: email as string, password })

  await service.rpc('lb_svc_login_result', { p_username: username, p_ok: !error })

  if (error || !data.session) {
    const banned = /banned/i.test(error?.message ?? '')
    return json({ error: banned ? 'هذا الحساب موقوف — تواصل مع المسؤول' : INVALID }, 400)
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
})
