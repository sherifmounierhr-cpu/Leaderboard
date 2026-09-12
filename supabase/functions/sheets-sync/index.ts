// sheets-sync — الجسر الآمن الوحيد بين Google Sheets وقاعدة البيانات.
//
// مفتاح Google لا يغادر هذه الدالة أبداً: يُقرأ من أسرار Supabase.
//   supabase secrets set GOOGLE_API_KEY=... SHEET_ID=... SYNC_SECRET=...
//
// الكتابة تتم عبر public.lb_sync (SECURITY DEFINER, service_role فقط) لأن
// schema "leaderboard" غير مكشوف عبر الـ API عمداً.
//
// الاستدعاء:
//   POST /functions/v1/sheets-sync      Header: x-sync-secret: <SYNC_SECRET>
//   اختياري: ?year=2026&snapshot=1

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const RANGES = ['Agents', 'Teams'] as const

type Row = Record<string, string>

/** يحوّل مصفوفة الصفوف الخام إلى كائنات مفاتيحها رؤوس الأعمدة بحروف صغيرة. */
function toObjects(values: unknown): Row[] {
  const rows = Array.isArray(values) ? (values as string[][]) : []
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => String(h).trim().toLowerCase())
  const out: Row[] = []
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i]
    if (!raw || raw.every((c) => c === '' || c == null)) continue
    const obj: Row = {}
    headers.forEach((h, idx) => {
      if (h) obj[h] = raw[idx] ?? ''
    })
    out.push(obj)
  }
  return out
}

/** يقرأ رقماً من خلية قد تحتوي فواصل أو رموز عملة. */
function num(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** يحوّل رابط Google Drive إلى رابط صورة قابل للعرض. */
function photoUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : raw
}

async function fetchSheets(sheetId: string, apiKey: string): Promise<Row[][]> {
  const ranges = RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const url = `${SHEETS_API}/${encodeURIComponent(sheetId)}/values:batchGet?${ranges}&key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets API HTTP ${res.status}`)
  const body = await res.json()
  const valueRanges = Array.isArray(body.valueRanges) ? body.valueRanges : []
  return RANGES.map((_, i) => toObjects(valueRanges[i]?.values))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

Deno.serve(async (req) => {
  const started = Date.now()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  try {
    // الدالة تُنشر بـ verify_jwt=false لأن المجدول يستدعيها بترويسة سرّ لا بـ JWT،
    // فالسرّ هو الحارس الوحيد — ولذلك غيابه رفضٌ لا تجاوز.
    const secret = Deno.env.get('SYNC_SECRET')
    if (!secret) {
      console.error('[sheets-sync] SYNC_SECRET غير مضبوط — رفض')
      return json({ error: 'not configured' }, 503)
    }
    if (req.headers.get('x-sync-secret') !== secret) {
      return json({ error: 'unauthorized' }, 401)
    }

    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    const sheetId = Deno.env.get('SHEET_ID')
    if (!apiKey || !sheetId) throw new Error('GOOGLE_API_KEY / SHEET_ID غير مضبوطين')

    const url = new URL(req.url)
    const year = Number(url.searchParams.get('year')) || new Date().getFullYear()

    const [agentRows, teamRows] = await fetchSheets(sheetId, apiKey)

    // الفرق: أسماؤها مصدرها عمود team في ورقة الوكلاء، وورقة Teams تضيف الشعار.
    const teamsByName = new Map<string, { name: string; name_ar: string | null; photo_url: string | null }>()
    for (const t of teamRows) {
      const name = String(t.name ?? '').trim()
      if (!name) continue
      teamsByName.set(name, {
        name,
        name_ar: t.name_ar?.trim() || null,
        photo_url: photoUrl(t.photo),
      })
    }
    for (const a of agentRows) {
      const name = String(a.team ?? '').trim()
      if (name && !teamsByName.has(name)) {
        teamsByName.set(name, { name, name_ar: null, photo_url: null })
      }
    }

    const agents = agentRows
      .map((a) => {
        const periods: Array<{ quarter: number; target: number; deals: number }> = []
        for (let q = 1; q <= 4; q++) {
          const target = num(a[`q${q}_target`])
          const deals = num(a[`q${q}_deals`])
          if (target === 0 && deals === 0) continue
          periods.push({ quarter: q, target, deals })
        }
        return {
          name: String(a.name ?? '').trim(),
          name_ar: a.name_ar?.trim() || null,
          team: String(a.team ?? '').trim() || null,
          photo_url: photoUrl(a.photo),
          periods,
        }
      })
      .filter((a) => a.name)

    if (!agents.length) throw new Error('الشيت لم يُرجع أي وكيل — تحقّق من اسم النطاق Agents')

    const { data: result, error } = await supabase.rpc('lb_sync', {
      p_year: year,
      p_payload: { teams: [...teamsByName.values()], agents },
    })
    if (error) throw error

    let snapshotRows = 0
    if (url.searchParams.get('snapshot') === '1') {
      const quarter = Math.floor(new Date().getMonth() / 3) + 1
      const { data, error: snapErr } = await supabase.rpc('lb_take_snapshot', {
        p_year: year,
        p_quarter: quarter,
      })
      if (snapErr) throw snapErr
      snapshotRows = Number(data) || 0
    }

    await supabase.rpc('lb_log_sync', { p_status: 'ok', p_rows: agents.length })

    return json({ ok: true, year, ...result, snapshot_rows: snapshotRows, ms: Date.now() - started })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sheets-sync]', message)
    try {
      await supabase.rpc('lb_log_sync', { p_status: 'error', p_rows: 0, p_error: message })
    } catch { /* التسجيل لا يجب أن يُخفي الخطأ الأصلي */ }
    return json({ ok: false, error: message }, 500)
  }
})
