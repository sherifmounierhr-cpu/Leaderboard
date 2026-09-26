import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'

const session = ref<Session | null>(null)
const role = ref<string | null>(null)
/** الأقسام المسموح بتعديلها (admin: كلها + users). */
const permissions = ref<string[]>([])
/** حساب عرض أو اطلاع: يرى صفحة الإدارة، والخادم يرفض أي كتابة منه. */
const isDemo = ref(false)
const ready = ref(false)
const busy = ref(false)
const authError = ref<string | null>(null)

let started = false

/**
 * الدور يُقرأ من الخادم لا من الـ JWT: صلاحية المسؤول تُفرض داخل دوال قاعدة
 * البيانات، وهذه القراءة تُستخدم لعرض الواجهة الصحيحة فقط.
 */
async function loadRole() {
  if (!session.value) {
    role.value = null
    permissions.value = []
    isDemo.value = false
    return
  }
  // دور خاص باللوحة (admin | editor | readonly | demo | viewer) وأقسامه
  const { data, error } = await supabase.rpc('lb_my_access')
  const access = error ? null : (data as { role?: string; permissions?: string[] } | null)
  role.value = access?.role ?? null
  permissions.value = access?.permissions ?? []
  isDemo.value = role.value === 'demo' || role.value === 'readonly'
}

function start() {
  if (started || !hasSupabaseConfig) {
    ready.value = true
    return
  }
  started = true

  void supabase.auth.getSession().then(async ({ data }) => {
    session.value = data.session
    await loadRole()
    ready.value = true
  })

  supabase.auth.onAuthStateChange(async (_event, next) => {
    session.value = next
    await loadRole()
  })
}

/**
 * Supabase يدخل بالبريد فقط: دالة الحافة تترجم الاسم إلى بريد على الخادم
 * وترجع الجلسة، فالبريد لا يصل للمتصفح. رسالة الخطأ منها عربية وموحّدة.
 */
async function signInWithUsername(username: string, password: string) {
  const { data, error } = await supabase.functions.invoke('username-sign-in', {
    body: { username, password },
  })
  if (error || !data?.access_token) {
    let message = 'بيانات الدخول غير صحيحة'
    try {
      const payload = await (error as { context?: Response } | null)?.context?.json()
      if (payload?.error) message = payload.error
    } catch { /* الرسالة العامة تكفي */ }
    authError.value = message
    return false
  }
  const { error: setErr } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })
  if (setErr) {
    authError.value = setErr.message
    return false
  }
  await loadRole()
  return true
}

export function useAuth() {
  start()

  /** بريد أو اسم مستخدم: وجود @ هو الفاصل (الأسماء لا تقبل @). */
  async function signIn(identifier: string, password: string) {
    busy.value = true
    authError.value = null
    try {
      const login = identifier.trim()
      if (!login.includes('@')) return await signInWithUsername(login, password)
      const { error } = await supabase.auth.signInWithPassword({ email: login, password })
      if (error) {
        authError.value =
          error.message === 'Invalid login credentials'
            ? 'بيانات الدخول غير صحيحة'
            : error.message
        return false
      }
      await loadRole()
      return true
    } finally {
      busy.value = false
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    role.value = null
    permissions.value = []
    isDemo.value = false
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return error ? error.message : null
  }

  return {
    session,
    ready,
    busy,
    authError,
    role,
    permissions,
    isSignedIn: computed(() => Boolean(session.value)),
    isAdmin: computed(() => role.value === 'admin'),
    isDemo,
    /** حساب العرض المشترك: كلمة مروره لا تتغيّر من الواجهة. */
    isSharedDemo: computed(() => role.value === 'demo'),
    /** من يرى صفحة الإدارة: المسؤول، المحرّر بقسم واحد على الأقل، أو حساب اطلاع. */
    canViewAdmin: computed(() => isDemo.value || permissions.value.length > 0),
    /** يرى التبويب؟ حسابات الاطلاع ترى الكل؛ المحرّر يرى أقسامه فقط. */
    canSee: (perm: string) => isDemo.value || permissions.value.includes(perm),
    // الحساب بلا بريد حقيقي يُعرض باسمه، لا بالبريد الداخلي
    email: computed(() => (session.value?.user.email ?? '').replace(/@noemail\.everest-leaderboard\.app$/, '')),
    signIn,
    signOut,
    changePassword,
  }
}
