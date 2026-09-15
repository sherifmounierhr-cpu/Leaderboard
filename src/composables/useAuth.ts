import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabase } from '@/lib/supabase'

const session = ref<Session | null>(null)
const role = ref<string | null>(null)
/** حساب عرض: يرى صفحة الإدارة، والخادم يرفض أي كتابة منه. */
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
    isDemo.value = false
    return
  }
  // دور خاص باللوحة (admin | demo | viewer) من مشروعها المستقل
  const { data, error } = await supabase.rpc('lb_role')
  role.value = error ? null : ((data as string) ?? null)
  isDemo.value = role.value === 'demo'
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

export function useAuth() {
  start()

  async function signIn(email: string, password: string) {
    busy.value = true
    authError.value = null
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
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
    isSignedIn: computed(() => Boolean(session.value)),
    isAdmin: computed(() => role.value === 'admin'),
    isDemo,
    /** من يرى صفحة الإدارة: المسؤول، أو حساب العرض للاطلاع فقط. */
    canViewAdmin: computed(() => role.value === 'admin' || isDemo.value),
    email: computed(() => session.value?.user.email ?? ''),
    signIn,
    signOut,
    changePassword,
  }
}
