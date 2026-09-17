import { computed, ref } from 'vue'
import { supabase } from '@/lib/supabase'

/**
 * مؤشر المساحة: قاعدة Supabase، ملفات Supabase (الصور)، ومستودع GitHub.
 *
 * حالة مشتركة على مستوى التطبيق: صفحة الإدارة وجرس الإشعارات يقرآن نفس
 * القياس، والتحديث التلقائي كل نصف ساعة يكفي — الاستهلاك يتحرك ببطء.
 */

export type Level = 'ok' | 'warn' | 'critical'
export type MeterKey = 'db' | 'files' | 'github'

export const WARN_PCT = 70
export const CRITICAL_PCT = 90
/** بعد كده النسخة الاحتياطية تعتبر قديمة ويُقترح عمل واحدة جديدة. */
export const BACKUP_STALE_DAYS = 30

const REFRESH_MS = 30 * 60_000
/** API GitHub بدون توكن مسموح 60 طلب/ساعة لكل IP — نخزّن القراءة ساعة. */
const GITHUB_CACHE_MS = 60 * 60_000
const GITHUB_CACHE_KEY = 'lb-github-usage'
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || 'sherifmounierhr-cpu/Leaderboard'
/** GitHub يوصي بمستودع أقل من 1GB، وموقع Pages حدّه 1GB. */
const GITHUB_LIMIT = 1024 * 1024 * 1024

export interface TableUsage {
  key: 'sale_events' | 'snapshots' | 'sync_log' | 'sales'
  rows: number
  bytes: number
  oldest: string | null
}

export interface StorageUsage {
  checked_at: string
  db: { used: number; limit: number }
  files: {
    used: number
    count: number
    limit: number
    orphan_count: number
    orphan_bytes: number
    orphan_paths: string[]
    orphan_media_paths?: string[]
    audio_bytes?: number
  }
  tables: TableUsage[]
  last_backup: string | null
  last_cleanup: string | null
}

export interface Meter {
  key: MeterKey
  used: number
  limit: number
  pct: number
  level: Level
}

const usage = ref<StorageUsage | null>(null)
const github = ref<{ used: number; checkedAt: number } | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const githubError = ref(false)

let timer: ReturnType<typeof setInterval> | null = null
let users = 0

export function levelOf(pct: number): Level {
  if (pct >= CRITICAL_PCT) return 'critical'
  if (pct >= WARN_PCT) return 'warn'
  return 'ok'
}

function meter(key: MeterKey, used: number, limit: number): Meter {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return { key, used, limit, pct, level: levelOf(pct) }
}

async function loadGithub(force: boolean) {
  try {
    const cached = JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY) ?? 'null')
    if (!force && cached && Date.now() - cached.checkedAt < GITHUB_CACHE_MS) {
      github.value = cached
      return
    }
  } catch { /* تخزين المتصفح غير متاح — نقرأ من الشبكة */ }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { size: number }
    // size بالكيلوبايت
    github.value = { used: body.size * 1024, checkedAt: Date.now() }
    githubError.value = false
    try { localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(github.value)) } catch { /* لا بأس */ }
  } catch {
    githubError.value = true
  }
}

async function refresh(force = false) {
  loading.value = true
  error.value = null
  try {
    const [{ data, error: rpcError }] = await Promise.all([
      supabase.rpc('lb_storage_usage'),
      loadGithub(force),
    ])
    if (rpcError) throw rpcError
    usage.value = data as StorageUsage
  } catch (err) {
    error.value = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)
  } finally {
    loading.value = false
  }
}

const meters = computed<Meter[]>(() => {
  const list: Meter[] = []
  if (usage.value) {
    list.push(meter('db', usage.value.db.used, usage.value.db.limit))
    list.push(meter('files', usage.value.files.used, usage.value.files.limit))
  }
  if (github.value) list.push(meter('github', github.value.used, GITHUB_LIMIT))
  return list
})

const worst = computed<Level>(() =>
  meters.value.some((m) => m.level === 'critical')
    ? 'critical'
    : meters.value.some((m) => m.level === 'warn')
      ? 'warn'
      : 'ok',
)

const backupStale = computed(() => {
  if (!usage.value) return false
  const last = usage.value.last_backup
  return !last || Date.now() - new Date(last).getTime() > BACKUP_STALE_DAYS * 86_400_000
})

/**
 * ابدأ القياس الدوري. كل مستخدم يستدعي stop عند الخروج؛ المؤقت يقف لما
 * مفيش حد محتاجه.
 */
function start() {
  users++
  if (!usage.value && !loading.value) void refresh()
  if (!timer) timer = setInterval(() => void refresh(), REFRESH_MS)
}

function stop() {
  users = Math.max(0, users - 1)
  if (!users && timer) {
    clearInterval(timer)
    timer = null
  }
}

export function useStorageHealth() {
  return { usage, github, githubError, meters, worst, backupStale, loading, error, refresh, start, stop }
}
