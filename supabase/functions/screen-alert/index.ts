// screen-alert — إيميل لما شاشة متابَعة تسكت، وإيميل تاني لما ترجع.
//
// الكرون في القاعدة بينده الدالة دي كل 5 دقايق، وبس لما يكون فيه حاجة فعلاً
// (`leaderboard.trigger_screen_alerts`). الدالة بتسأل القاعدة مين يستاهل
// إيميل، بتبعت، وبعد نجاح الإرسال بتعلّم — فالتنبيه ما يتكرّرش، ولو الإرسال
// فشل يفضل مستنّي بدل ما يضيع.
//
// مفتاح Resend عمره ما بيدخل القاعدة: هو في أسرار الدالة وحدها.
//
// تُنشر بـ verify_jwt=false — المستدعي هو pg_net مش متصفح — والحماية هي
// ترويسة السرّ المشترك اللي في Vault.
//
//   POST /functions/v1/screen-alert     header: x-alert-secret

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALERT_SECRET = Deno.env.get('ALERT_SECRET') ?? ''
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
/** لازم يكون على نطاق موثَّق في Resend، وإلا الإرسال بيترفض. */
const MAIL_FROM = Deno.env.get('ALERT_FROM') ?? 'Everest Board <onboarding@resend.dev>'

const BOARD_URL = Deno.env.get('BOARD_URL') ?? ''

interface DueRow {
  id: string
  label: string
  kind: 'down' | 'up'
  last_seen: string
  minutes: number
}

/** «من ساعة و20 دقيقة» أوضح من «80 دقيقة» في سطر موضوع إيميل. */
function arabicSince(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} دقيقة`
  if (m === 0) return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`
  return `${h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`} و${m} دقيقة`
}

function cairoTime(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * إيميل واحد لكل حالة، مش إيميل لكل شاشة: لو تلات شاشات وقعوا مع بعض
 * (الكهربا أو النت)، تلات إيميلات مالهاش لازمة.
 */
function buildEmail(kind: 'down' | 'up', rows: DueRow[]) {
  const many = rows.length > 1
  const names = rows.map((r) => r.label).join('، ')

  const subject = kind === 'down'
    ? many ? `⚠️ ${rows.length} شاشات مش شغّالة` : `⚠️ «${names}» مش شغّالة`
    : many ? `✅ ${rows.length} شاشات رجعت` : `✅ «${names}» رجعت`

  const heading = kind === 'down'
    ? many ? 'الشاشات دي سكتت' : 'الشاشة دي سكتت'
    : many ? 'الشاشات دي رجعت تشتغل' : 'الشاشة دي رجعت تشتغل'

  const accent = kind === 'down' ? '#b4232a' : '#1a7f4b'

  const items = rows.map((r) => {
    const detail = kind === 'down'
      ? `آخر إشارة من ${esc(arabicSince(r.minutes))} — ${esc(cairoTime(r.last_seen))}`
      : `رجعت تنبض — ${esc(cairoTime(r.last_seen))}`
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e6e8eb">
        <div style="font-weight:700;font-size:16px;color:#1e242c">${esc(r.label)}</div>
        <div style="font-size:14px;color:#6b7280;margin-top:2px">${detail}</div>
      </td>
    </tr>`
  }).join('')

  const link = BOARD_URL
    ? `<p style="margin:24px 0 0">
         <a href="${esc(BOARD_URL)}?admin=1"
            style="background:#1e242c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">
           افتح تبويب الأجهزة
         </a>
       </p>`
    : ''

  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e6e8eb">
    <div style="background:${accent};color:#fff;padding:18px 20px;font-size:18px;font-weight:700">${esc(heading)}</div>
    <table role="presentation" style="width:100%;border-collapse:collapse">${items}</table>
    <div style="padding:20px">
      ${link}
      <p style="margin:24px 0 0;font-size:13px;color:#9aa1ab;line-height:1.7">
        الرسالة دي اتبعتت لأن الشاشة متعلّم عليها «تحت المتابعة» في تبويب الأجهزة.
        لإيقافها: شيل العلامة، أو اقفل التنبيه من نفس التبويب.
      </p>
    </div>
  </div>
</body></html>`

  const text = `${heading}\n\n` +
    rows.map((r) => kind === 'down'
      ? `• ${r.label} — آخر إشارة من ${arabicSince(r.minutes)} (${cairoTime(r.last_seen)})`
      : `• ${r.label} — رجعت ${cairoTime(r.last_seen)}`).join('\n')

  return { subject, html, text }
}

async function sendEmail(to: string, mail: { subject: string; html: string; text: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], ...mail }),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

Deno.serve(async (req) => {
  // السرّ المشترك: المستدعي الشرعي الوحيد هو الكرون
  if (!ALERT_SECRET || req.headers.get('x-alert-secret') !== ALERT_SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  if (!RESEND_KEY) {
    return Response.json({ error: 'RESEND_API_KEY غير مضبوط' }, { status: 500 })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // غلاف في public لـservice_role وحده: schema leaderboard مش مكشوف عبر الـAPI
  const { data, error } = await db.rpc('lb_screen_alerts_due')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const payload = data as { email: string | null; rows: DueRow[] }
  const to = payload?.email
  if (!to) return Response.json({ sent: 0, note: 'مفيش بريد متابعة' })

  const rows = payload.rows ?? []
  if (!rows.length) return Response.json({ sent: 0 })

  const results: Record<string, unknown> = {}

  for (const kind of ['down', 'up'] as const) {
    const group = rows.filter((r) => r.kind === kind)
    if (!group.length) continue
    try {
      await sendEmail(to, buildEmail(kind, group))
      // العلامة بعد نجاح الإرسال بس — فشل الإرسال يخلّي التنبيه مستنّي للمرة الجاية
      await db.rpc('lb_mark_screen_alerted', {
        p_ids: group.map((r) => r.id),
        p_kind: kind,
      })
      results[kind] = group.length
    } catch (err) {
      results[kind] = `failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return Response.json({ sent: rows.length, results })
})
