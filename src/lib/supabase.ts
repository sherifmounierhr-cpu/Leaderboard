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
