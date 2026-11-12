import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY غير مضبوطين — ستُعرض البيانات التجريبية.',
  )
}

/**
 * عميل للقراءة فقط. المفتاح anon مصمّم للانكشاف في المتصفح؛
 * الحماية الفعلية من RLS: SELECT مسموح، والكتابة محجوبة تماماً.
 */
// `||` وليس `??`: متغيّر مضبوط بقيمة فاضية يمرّ من `??` ويُسقط createClient
// بـ "supabaseUrl is required"، فتظهر شاشة بيضاء بدل البيانات الاحتياطية.
export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 2 } },
})

export const hasSupabaseConfig = Boolean(url && anonKey)

/**
 * «شوف شاشته»: المسؤول بيعاين صفحة الإدارة بصلاحيات مستخدم تاني، والخادم لسه
 * شايفه هو (مسؤول). عشان ما يكتبش بالغلط وهو في المعاينة، كل عملية كتابة
 * (دوال lb_admin_* ما عدا القراءة، الدوال الحافة، رفع الملفات) بتتحجب هنا.
 */
let previewReadOnly = false
export function setPreviewReadOnly(on: boolean) {
  previewReadOnly = on
}
const PREVIEW_READS = new Set(['lb_admin_list_users', 'lb_admin_audit_log'])
const BLOCKED = { data: null, error: { message: 'معاينة بصلاحيات مستخدم — للاطلاع فقط، لا يمكن الحفظ', details: '', hint: '', code: '42501', name: 'PostgrestError' } }

const client = supabase as unknown as {
  rpc: (name: string, ...rest: unknown[]) => unknown
  functions: { invoke: (...args: unknown[]) => unknown }
  storage: { from: (bucket: string) => Record<string, unknown> }
}
const realRpc = client.rpc.bind(supabase)
client.rpc = (name: string, ...rest: unknown[]) =>
  previewReadOnly && name.startsWith('lb_admin_') && !PREVIEW_READS.has(name) ? Promise.resolve(BLOCKED) : realRpc(name, ...rest)
const realInvoke = client.functions.invoke.bind(supabase.functions)
client.functions.invoke = (...args: unknown[]) =>
  previewReadOnly ? Promise.resolve({ data: null, error: new Error(BLOCKED.error.message) }) : realInvoke(...args)
const realFrom = client.storage.from.bind(supabase.storage)
client.storage.from = (bucket: string) => {
  const api = realFrom(bucket)
  return new Proxy(api, {
    get(target, prop, receiver) {
      if (previewReadOnly && (prop === 'upload' || prop === 'remove' || prop === 'update' || prop === 'move' || prop === 'copy')) {
        return () => Promise.resolve({ data: null, error: new Error(BLOCKED.error.message) })
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}
