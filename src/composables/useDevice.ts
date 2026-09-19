import { supabase } from '@/lib/supabase'
import { isKiosk } from './useSettings'

/**
 * تسجيل الجهاز: كل شاشة فاتحة البرنامج بتقول «أنا موجودة» كل دقيقة، فصفحة
 * الإدارة تعرف الأجهزة المتصلة. لو المسؤول قطع الاتصال، النبضة الجاية بترجع
 * true فالجهاز يخرج من الحساب فوراً.
 */

const PING_MS = 60_000
const DEVICE_KEY = 'everest.device-id'

let timer: ReturnType<typeof setInterval> | null = null
let started = false

function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY)
    if (saved) return saved
    const fresh = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, fresh)
    return fresh
  } catch {
    // تخزين محظور: معرّف مؤقت لكل فتح للصفحة
    return crypto.randomUUID()
  }
}

/** اسم افتراضي مقروء: «Chrome · Windows · 1920×1080». */
function defaultLabel(): string {
  const ua = navigator.userAgent
  const browser =
    /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os =
    /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os, `${screen.width}×${screen.height}`].filter(Boolean).join(' · ').slice(0, 60)
}

/** معرّف جلسة Supabase من داخل التوكن — بيه نقدر نلغي الجلسة عند قطع الاتصال. */
function sessionId(token: string | undefined): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

async function ping(view: () => string) {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return

  const { data: revoked, error } = await supabase.rpc('lb_device_ping', {
    p_id: deviceId(),
    p_label: defaultLabel(),
    p_agent: navigator.userAgent,
    p_screen: `${screen.width}×${screen.height}`,
    p_view: view(),
    p_kiosk: isKiosk,
    p_session: sessionId(session.access_token),
  })
  if (error) {
    console.warn('[device]', error.message)
    return
  }
  if (revoked === true) {
    // المسؤول قطع الاتصال: خروج فوري، وشاشة تسجيل الدخول تظهر
    await supabase.auth.signOut()
  }
}

/** تُستدعى من اللوحة بعد تسجيل الدخول. */
export function useDevice(view: () => string) {
  if (started) return
  started = true
  void ping(view)
  timer = setInterval(() => void ping(view), PING_MS)
  window.addEventListener('beforeunload', () => { if (timer) clearInterval(timer) })
}
