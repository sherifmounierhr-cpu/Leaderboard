import { supabase } from '@/lib/supabase'
import type { AgentStanding, DealRow, RankHistoryPoint, SaleEventRow, TeamStanding } from '@/lib/types'

/**
 * نسخة احتياطية «قابلة للعرض»: ملف HTML واحد يفتح في أي متصفح بدون إنترنت
 * ولا تسجيل دخول — فيه ترتيب الفرق والمستشارين لكل ربع، سجل الإشعارات،
 * واللقطات اليومية كجداول مقروءة. البيانات الخام كاملة مضمّنة في آخر الملف
 * كـ JSON، فيمكن استرجاع أي رقم منها لاحقاً.
 */

const PAGE = 1000

/** PostgREST يرجّع 1000 صف كحد أقصى — نقرأ على صفحات حتى النهاية. */
async function fetchAll<T>(view: string, order: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(view).select('*').order(order).range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return rows
  }
}

export interface BackupData {
  created_at: string
  teams: Record<string, unknown>[]
  agents: Record<string, unknown>[]
  team_standings: TeamStanding[]
  agent_standings: AgentStanding[]
  team_contributions: Record<string, unknown>[]
  sale_events: SaleEventRow[]
  rank_history: RankHistoryPoint[]
  deals: DealRow[]
}

export async function collectBackup(): Promise<BackupData> {
  const [teams, agents, team_standings, agent_standings, team_contributions, sale_events, rank_history, deals] =
    await Promise.all([
      fetchAll<Record<string, unknown>>('lb_teams', 'name'),
      fetchAll<Record<string, unknown>>('lb_agents', 'name'),
      fetchAll<TeamStanding>('lb_team_standings', 'year'),
      fetchAll<AgentStanding>('lb_agent_standings', 'year'),
      fetchAll<Record<string, unknown>>('lb_team_contributions', 'year'),
      fetchAll<SaleEventRow>('lb_sale_events', 'id'),
      fetchAll<RankHistoryPoint>('lb_rank_history', 'taken_on'),
      fetchAll<DealRow>('lb_deals', 'deal_date'),
    ])
  return {
    created_at: new Date().toISOString(),
    teams, agents, team_standings, agent_standings, team_contributions, sale_events, rank_history, deals,
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const num = (v: unknown) => new Intl.NumberFormat('en-US').format(Math.round(Number(v) || 0))
const nameOf = (en: unknown, ar: unknown) => esc(ar || en)

function table(head: string[], rows: string[][]) {
  if (!rows.length) return '<p class="empty">لا توجد بيانات</p>'
  return `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`
}

export function renderBackupHtml(d: BackupData): string {
  const created = new Date(d.created_at)
  const stamp = created.toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'full', timeStyle: 'short' })

  // الأرباع من الأحدث للأقدم
  const periods = [...new Set(d.team_standings.map((r) => `${r.year}-${r.quarter}`))]
    .map((k) => k.split('-').map(Number) as [number, number])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1])

  const quarterSections = periods
    .map(([y, q]) => {
      const teams = d.team_standings.filter((r) => r.year === y && r.quarter === q).sort((a, b) => a.rank - b.rank)
      const agents = d.agent_standings.filter((r) => r.year === y && r.quarter === q).sort((a, b) => a.rank - b.rank)
      const totalDeals = teams.reduce((s, r) => s + Number(r.deals), 0)
      const totalTarget = teams.reduce((s, r) => s + Number(r.target), 0)
      return `<section>
  <h2>الربع ${q} — ${y}</h2>
  <p class="meta">إجمالي المبيعات <b>${num(totalDeals)}</b> ج.م · المستهدف <b>${num(totalTarget)}</b> ج.م</p>
  <h3>ترتيب الفرق</h3>
  ${table(
    ['#', 'الفريق', 'المبيعات (ج.م)', 'المستهدف (ج.م)', 'الإنجاز', 'الأعضاء', 'القيادة'],
    teams.map((r) => [
      String(r.rank),
      nameOf(r.name, r.name_ar),
      num(r.deals),
      num(r.target),
      `${Math.round(Number(r.pct) || 0)}%`,
      String(r.members),
      (r.leads ?? []).map((l) => `${l.role === 'manager' ? 'مدير' : 'مشرف'}: ${nameOf(l.name, l.name_ar)}`).join('، '),
    ]),
  )}
  <h3>ترتيب المستشارين</h3>
  ${table(
    ['#', 'المستشار', 'الفريق', 'المبيعات (ج.م)', 'المستهدف (ج.م)', 'الإنجاز'],
    agents.map((r) => [
      String(r.rank),
      nameOf(r.name, r.name_ar),
      nameOf(r.team, r.team_ar),
      num(r.deals),
      num(r.target),
      `${Math.round(Number(r.pct) || 0)}%`,
    ]),
  )}
</section>`
    })
    .join('\n')

  const events = table(
    ['التاريخ', 'النوع', 'المستشار', 'الفريق', 'قيمة الصفقة', 'الإجمالي', 'ملاحظة'],
    [...d.sale_events].reverse().map((e) => [
      esc(new Date(e.created_at).toLocaleString('ar-EG-u-nu-latn')),
      e.kind === 'manual' ? 'تهنئة' : 'صفقة',
      nameOf(e.name, e.name_ar),
      nameOf(e.team, e.team_ar),
      e.kind === 'sale' ? num(e.amount_egp) : '—',
      num(e.total_egp),
      esc(e.note),
    ]),
  )

  const deals = table(
    ['تاريخ الصفقة', 'المستشار', 'الفريق', 'المبلغ (ج.م)', 'الربع'],
    [...d.deals].map((x) => [
      esc(x.deal_date),
      nameOf(x.name, x.name_ar),
      nameOf(x.team, x.team_ar),
      num(x.amount_egp),
      `Q${x.quarter} ${x.year}`,
    ]),
  )

  const history = table(
    ['اليوم', 'النوع', 'الاسم', 'الربع', 'المبيعات (ج.م)', 'الترتيب'],
    d.rank_history.map((r) => [
      esc(r.taken_on),
      r.scope === 'team' ? 'فريق' : 'مستشار',
      esc(r.entity_name),
      `Q${r.quarter} ${r.year}`,
      num(r.deals),
      String(r.rank),
    ]),
  )

  // </script> داخل النص يكسر الوسم — نهرب الـ < في الـ JSON
  const json = JSON.stringify(d).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نسخة احتياطية — لوحة المبيعات — ${esc(d.created_at.slice(0, 10))}</title>
<style>
  :root { color-scheme: light; --accent: #0f6338; --line: #e3e8e5; --mute: #5b6b62; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; font: 15px/1.6 Tajawal, "Segoe UI", Tahoma, sans-serif; background: #f6f8f7; color: #13241b; }
  main { max-width: 1100px; margin: 0 auto; }
  header { background: #0b2a1b; color: #fff; border-radius: 14px; padding: 20px 24px; margin-bottom: 24px; }
  header h1 { margin: 0 0 4px; font-size: 24px; }
  header p { margin: 0; opacity: .8; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; }
  .stats span { background: rgba(255,255,255,.1); border-radius: 8px; padding: 4px 12px; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  nav a { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; color: var(--accent); text-decoration: none; font-weight: 600; }
  section { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 20px; margin-bottom: 20px; }
  h2 { margin: 0 0 4px; color: var(--accent); font-size: 20px; }
  h3 { margin: 18px 0 8px; font-size: 16px; }
  .meta, .empty { color: var(--mute); margin: 0; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: start; padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td:last-child { white-space: normal; min-width: 14rem; }
  th { background: #eef3f0; font-size: 13px; color: var(--mute); position: sticky; top: 0; }
  tbody tr:nth-child(even) { background: #fafcfb; }
  details summary { cursor: pointer; font-weight: 700; color: var(--accent); }
  @media print { body { background: #fff; } nav { display: none; } section { break-inside: avoid-page; } }
</style>
</head>
<body>
<main>
<header>
  <h1>نسخة احتياطية — لوحة المبيعات</h1>
  <p>أُنشئت ${esc(stamp)}</p>
  <div class="stats">
    <span>${d.teams.length} فريق</span>
    <span>${d.agents.length} مستشار</span>
    <span>${periods.length} ربع</span>
    <span>${d.deals.length} صفقة</span>
    <span>${d.sale_events.length} إشعار</span>
    <span>${d.rank_history.length} لقطة يومية</span>
  </div>
</header>
<nav>
  ${periods.map(([y, q]) => `<a href="#q-${y}-${q}">Q${q} ${y}</a>`).join('')}
  <a href="#deals">الصفقات</a><a href="#events">الإشعارات</a><a href="#history">اللقطات اليومية</a>
</nav>
${quarterSections.replace(/<section>\n  <h2>الربع (\d) — (\d+)<\/h2>/g, '<section id="q-$2-$1">\n  <h2>الربع $1 — $2</h2>')}
<section id="deals"><h2>الصفقات المسجّلة</h2>${deals}</section>
<section id="events"><h2>سجل الإشعارات والتهاني</h2>${events}</section>
<section id="history"><details><summary>اللقطات اليومية للترتيب (${d.rank_history.length})</summary>${history}</details></section>
<section><h2>البيانات الخام</h2><p class="meta">كل البيانات بصيغة JSON داخل هذا الملف (وسم backup-data) لاسترجاعها عند الحاجة.</p></section>
</main>
<script type="application/json" id="backup-data">${json}</script>
</body>
</html>`
}

export function downloadText(content: string, filename: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
