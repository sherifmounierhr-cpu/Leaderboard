// admin-users — إنشاء حسابات صفحة الإدارة وحذفها وتغيير كلمة مرورها.
//
// هذه العمليات تحتاج service_role، فلا تحصل من المتصفح. المفتاح لا يغادر
// هذه الدالة. تُنشر بـ verify_jwt=true، وأول خطوة التأكد من أن المستدعي مسؤول
// كامل عبر lb_my_access() بتوكنه هو — لا بمفتاح الخدمة.
//
// تحديد الصلاحيات نفسه يمر عبر public.lb_admin_set_access (المحروسة) بتوكن
// المستدعي، فالقواعد (لا تعديل للنفس، لا حساب عرض…) في مكان واحد.
//
//   POST /functions/v1/admin-users
//   { action: 'create', email?, username?, password, role, permissions }
//     (واحد منهما على الأقل؛ بلا بريد يُعطى بريداً داخلياً لا يستقبل رسائل)
//   { action: 'password', user_id, password }
//   { action: 'ban', user_id, banned }
//   { action: 'delete', user_id }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MIN_PASSWORD = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/
/** نفس النطاق في 0023_usernames.sql — القاعدة تتعرّف به على الحساب بلا بريد. */
const NO_EMAIL_DOMAIN = 'noemail.everest-leaderboard.app'

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

const fail = (message: string, status = 400) => json({ ok: false, error: message }, status)

function passwordError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `كلمة المرور قصيرة — ${MIN_PASSWORD} أحرف على الأقل`
  }
  if (password.length > 72) return 'كلمة المرور أطول من 72 حرفاً'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return fail('method not allowed', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  // المستدعي بصلاحياته هو — كل فحص صلاحية يمر من هنا
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // التوكن صراحةً: getUser() بلا وسيط يقرأ جلسة مخزّنة، ولا توجد هنا
  const { data: me } = await caller.auth.getUser(token)
  if (!me.user) return fail('unauthorized', 401)

  const { data: access, error: accessErr } = await caller.rpc('lb_my_access')
  const perms = (access as { permissions?: string[] } | null)?.permissions ?? []
  if (accessErr || !perms.includes('users')) {
    return fail('إدارة المستخدمين للمسؤول الكامل فقط', 403)
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('طلب غير صالح')
  }

  const action = String(body.action ?? '')
  const userId = typeof body.user_id === 'string' ? body.user_id : ''

  // الحذف والإيقاف وكلمة المرور على حساب آخر فقط: المسؤول لا يقفل نفسه بالخطأ
  if (action !== 'create') {
    if (!userId) return fail('المستخدم مطلوب')
    if (userId === me.user.id) return fail('لا يمكنك تنفيذ هذا على حسابك — استخدم «تغيير كلمة المرور»')
  }

  try {
    switch (action) {
      case 'create': {
        const username = String(body.username ?? '').trim().toLowerCase()
        let email = String(body.email ?? '').trim().toLowerCase()
        if (!email && !username) return fail('اكتب البريد أو اسم المستخدم')
        if (username && !USERNAME_RE.test(username)) {
          return fail('اسم المستخدم من 3 إلى 30 حرفاً: حروف إنجليزية صغيرة وأرقام و . _ - ويبدأ بحرف أو رقم')
        }
        if (email && (!EMAIL_RE.test(email) || email.endsWith(`@${NO_EMAIL_DOMAIN}`))) {
          return fail('البريد الإلكتروني غير صالح')
        }
        if (!email) email = `${username}@${NO_EMAIL_DOMAIN}`
        const pwErr = passwordError(body.password)
        if (pwErr) return fail(pwErr)

        const { data, error } = await service.auth.admin.createUser({
          email,
          password: body.password as string,
          email_confirm: true,
        })
        if (error) {
          if (!/already|registered|exists/i.test(error.message)) return fail(error.message)
          return fail(email.endsWith(`@${NO_EMAIL_DOMAIN}`) ? 'اسم المستخدم مستخدم بالفعل' : 'هذا البريد مسجَّل بالفعل')
        }

        let { error: setErr } = await caller.rpc('lb_admin_set_access', {
          p_user_id: data.user.id,
          p_role: String(body.role ?? 'viewer'),
          p_permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
        })
        if (!setErr && username) {
          ;({ error: setErr } = await caller.rpc('lb_admin_set_username', {
            p_user_id: data.user.id,
            p_username: username,
          }))
        }
        if (setErr) {
          // حساب بلا صلاحيات صحيحة لا يبقى معلّقاً
          await service.auth.admin.deleteUser(data.user.id)
          return fail(setErr.message)
        }
        return json({ ok: true, id: data.user.id })
      }

      case 'password': {
        const pwErr = passwordError(body.password)
        if (pwErr) return fail(pwErr)
        const { error } = await service.auth.admin.updateUserById(userId, { password: body.password as string })
        if (error) return fail(error.message)
        return json({ ok: true })
      }

      case 'ban': {
        // الإيقاف يلغي تجديد الجلسة؛ التوكن الحالي ينتهي خلال ساعة على الأكثر
        const { error } = await service.auth.admin.updateUserById(userId, {
          ban_duration: body.banned ? '876000h' : 'none',
        })
        if (error) return fail(error.message)
        return json({ ok: true })
      }

      case 'delete': {
        // صفوف admins و user_access تُحذف معه (ON DELETE CASCADE)
        const { error } = await service.auth.admin.deleteUser(userId)
        if (error) return fail(error.message)
        return json({ ok: true })
      }

      default:
        return fail('إجراء غير معروف')
    }
  } catch (err) {
    console.error('[admin-users]', err)
    return fail('خطأ غير متوقع', 500)
  }
})
