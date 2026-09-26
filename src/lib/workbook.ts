/**
 * تصدير واستيراد ملفات Excel.
 *
 * أسماء الأعمدة مطابقة عمداً لـ docs/Everest-Sales-Workbook.xlsx ولما تقرأه
 * دالة sheets-sync، فالملف المصدَّر هنا يُرفع على جوجل شيت كما هو، والعكس.
 * المكتبتان تُحمّلان عند الطلب فقط — صفحة اللوحة لا تحتاجهما.
 */

export interface WorkbookPeriod {
  quarter: number
  target: number
  deals: number
}

export interface WorkbookAgent {
  name: string
  name_ar: string | null
  team: string | null
  photo_url: string | null
  periods: WorkbookPeriod[]
}

export interface WorkbookTeam {
  name: string
  name_ar: string | null
  photo_url: string | null
}

export interface WorkbookDeal {
  /** اسم المستشار كما في ورقة Agents (الإنجليزي أو العربي). */
  agent: string
  /** YYYY-MM-DD */
  date: string
  amount: number
  developer: string | null
  project: string | null
  /** رقم الصف في Excel — لرسائل الخطأ. */
  row?: number
  /** للعرض في التصدير فقط؛ الاستيراد يأخذ الفريق من المستشار. */
  team?: string | null
}

export interface WorkbookPayload {
  teams: WorkbookTeam[]
  agents: WorkbookAgent[]
  deals: WorkbookDeal[]
}

const QUARTERS = [1, 2, 3, 4] as const

/** حد أمان: ملف ضخم بالخطأ لا يجب أن يعلّق المتصفح أو يغرق القاعدة. */
const MAX_ROWS = 5000

// --------------------------------------------------------------------- تصدير

type Cell = string | number | Date

/** صف الترويسة بخط عريض، والأرقام والتواريخ بنوعها الحقيقي لا نصوص. */
function toCells(rows: Cell[][]) {
  return rows.map((row, r) =>
    row.map((value) => {
      if (value instanceof Date) return { value, type: Date, format: 'yyyy-mm-dd' }
      return {
        value,
        fontWeight: r === 0 ? ('bold' as const) : undefined,
        type: typeof value === 'number' ? Number : String,
      }
    }),
  )
}

/** تاريخ YYYY-MM-DD كـ Date عند منتصف الليل UTC — Excel يعرضه بنفس اليوم. */
function isoToDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * ورقة الإرشادات: أول ورقة في الملف، بالعربي ومن اليمين لليسار. سطر لكل
 * تعليمة؛ العناوين بخط عريض.
 */
function instructionRows(year: number) {
  const H = (text: string) => [{ value: text, fontWeight: 'bold' as const, type: String }]
  const L = (text: string) => [{ value: text, type: String, wrap: true }]
  const blank = [{ value: '', type: String }]
  return [
    [{ value: 'دليل إدخال البيانات — لوحة إيفرست', fontWeight: 'bold' as const, fontSize: 16, type: String }],
    blank,
    H('قواعد عامة'),
    L('• الملف فيه 3 أوراق: Teams (الفرق) و Agents (المستشارون والأهداف) و Deals (الصفقات). ورقة الإرشادات دي بتتجاهل عند الرفع.'),
    L('• لا تغيّر أسماء الأوراق ولا الصف الأول في كل ورقة (عناوين الأعمدة بالإنجليزي). ابدأ الإدخال من الصف الثاني.'),
    L('• الترتيب: الفرق أولاً، ثم المستشارون، ثم الصفقات — كل ورقة بتعتمد على الأسماء اللي قبلها.'),
    L('• الأرقام أرقام بس: 1500000 وليس "1,500,000 جنيه".'),
    L(`• الأهداف وأرقام ورقة Agents تخص سنة ${year} (السنة المختارة في صفحة الإدارة وقت الرفع). الصفقات بتتحسب في سنة وربع تاريخها.`),
    L('• الرفع يضيف ويحدّث بالاسم ولا يحذف أحداً. لبدء بيانات جديدة من الصفر: «مسح البيانات» في نفس التبويب أولاً، ثم ارفع الملف.'),
    L('• الرفع لا يطلق احتفالات على الشاشات.'),
    blank,
    H('ورقة Teams — الفرق'),
    L('• name: اسم الفريق بالإنجليزي — إلزامي، ومفتاح الربط مع باقي الأوراق. لا يتكرر.'),
    L('• name_ar: الاسم بالعربي (اختياري) — هو اللي بيظهر على اللوحة بالعربي.'),
    L('• photo: رابط صورة أو رابط Google Drive (اختياري). الأسهل رفع الصورة من صفحة الإدارة بعد كده.'),
    blank,
    H('ورقة Agents — المستشارون والأهداف'),
    L('• name: اسم المستشار بالإنجليزي — إلزامي ولا يتكرر.'),
    L('• name_ar: الاسم بالعربي (اختياري).'),
    L('• team: اسم الفريق بالإنجليزي بالظبط زي ورقة Teams.'),
    L('• photo: رابط صورة (اختياري).'),
    L('• q1_target … q4_target: مستهدف كل ربع بالجنيه.'),
    L('• q1_deals … q4_deals: مبيعات الربع «غير المسجّلة» كصفقات في ورقة Deals. لو هتسجّل كل الصفقات بالتفصيل، اكتب 0.'),
    L('• إجمالي الربع على اللوحة = q_deals + مجموع صفقات الربع في ورقة Deals.'),
    blank,
    H('ورقة Deals — الصفقات'),
    L('• agent: اسم المستشار زي ورقة Agents (بالإنجليزي أو بالعربي) — إلزامي.'),
    L('• date: تاريخ الصفقة — إلزامي. خلية تاريخ في Excel أو نص بالشكل 2026-09-23 أو 23/09/2026. لا يكون في المستقبل.'),
    L('• amount_egp: مبلغ الصفقة بالجنيه — إلزامي وأكبر من صفر.'),
    L('• developer / project: المطوّر والمشروع (اختياري).'),
    L('• team: للعرض فقط وبيتجاهل عند الرفع — الفريق بيتاخد من المستشار.'),
    L('• صفقة موجودة بالفعل (نفس المستشار والتاريخ والمبلغ والمطوّر والمشروع) لا تتكرر لو رفعت نفس الملف مرة تانية.'),
    blank,
    H('لو ظهر خطأ عند الرفع'),
    L('• الرسالة بتذكر اسم الورقة ورقم الصف. صحّحه في الملف وارفعه تاني — لا شيء يتكتب لو فيه خطأ.'),
  ]
}

export async function exportWorkbook(payload: WorkbookPayload, year: number) {
  await (await buildWorkbook(payload, year)).toFile(`Everest-Leaderboard-${year}.xlsx`)
}

/** الملف نفسه بدون تنزيل — toBlob() منه يتقري بـ parseWorkbook للتجربة. */
export async function buildWorkbook(payload: WorkbookPayload, year: number) {
  // المسار /browser صراحةً: الحزمة لا تصدّر جذراً، ونسخة node تستورد fs
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const teamRows: (string | number)[][] = [
    ['name', 'name_ar', 'photo'],
    ...payload.teams.map((t) => [t.name, t.name_ar ?? '', t.photo_url ?? '']),
  ]

  const agentHeader = ['name', 'name_ar', 'team', 'photo']
  for (const q of QUARTERS) agentHeader.push(`q${q}_target`, `q${q}_deals`)

  const agentRows: (string | number)[][] = [
    agentHeader,
    ...payload.agents.map((a) => {
      const row: (string | number)[] = [a.name, a.name_ar ?? '', a.team ?? '', a.photo_url ?? '']
      for (const q of QUARTERS) {
        const p = a.periods.find((x) => x.quarter === q)
        row.push(p?.target ?? 0, p?.deals ?? 0)
      }
      return row
    }),
  ]

  const dealRows: Cell[][] = [
    ['agent', 'date', 'amount_egp', 'developer', 'project', 'team'],
    ...payload.deals.map((d) => [
      d.agent, isoToDate(d.date), d.amount, d.developer ?? '', d.project ?? '', d.team ?? '',
    ]),
  ]

  // الترويسات إنجليزية لأنها عقد أعمدة sheets-sync، فتُترك الورقة يسار-يمين
  return writeXlsxFile([
    {
      sheet: 'Instructions',
      data: instructionRows(year),
      columns: [{ width: 120 }],
      rightToLeft: true,
    },
    {
      sheet: 'Teams',
      data: toCells(teamRows),
      columns: [{ width: 24 }, { width: 24 }, { width: 40 }],
    },
    {
      sheet: 'Agents',
      data: toCells(agentRows),
      columns: [
        { width: 24 },
        { width: 24 },
        { width: 20 },
        { width: 34 },
        ...QUARTERS.flatMap(() => [{ width: 14 }, { width: 14 }]),
      ],
    },
    {
      sheet: 'Deals',
      data: toCells(dealRows),
      columns: [{ width: 24 }, { width: 14 }, { width: 16 }, { width: 22 }, { width: 22 }, { width: 20 }],
    },
  ])
}

/** تصدير جدول تقرير واحد — الترويسة ثم الصفوف كما هي معروضة. */
export async function exportRows(
  sheetName: string,
  header: string[],
  rows: (string | number)[][],
  fileName: string,
  rightToLeft = false,
) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  await writeXlsxFile(toCells([header, ...rows]), {
    // اسم الورقة قد يحمل محارف تمنعها Excel (\ / ? * [ ]) وطوله الأقصى 31
    sheet: sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    columns: header.map(() => ({ width: 22 })),
    rightToLeft,
  }).toFile(fileName)
}

// ------------------------------------------------------------------- استيراد

/** الأرقام قد تأتي بفواصل أو رموز عملة من تحرير يدوي. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function toText(value: unknown): string {
  return String(value ?? '').trim()
}

/** ترويسة متسامحة: تتجاهل حالة الأحرف والمسافات والشرطات. */
function headerIndex(header: unknown[]): Map<string, number> {
  const map = new Map<string, number>()
  header.forEach((cell, i) => {
    const key = toText(cell).toLowerCase().replace(/[\s_-]+/g, '')
    if (key) map.set(key, i)
  })
  return map
}

function pick(row: unknown[], index: Map<string, number>, ...names: string[]): unknown {
  for (const name of names) {
    const i = index.get(name.toLowerCase().replace(/[\s_-]+/g, ''))
    if (i != null) return row[i]
  }
  return undefined
}

export interface ImportSummary {
  teams: number
  agents: number
  periods: number
  skipped: number
  /** صفقات جديدة اتضافت، وصفقات كانت موجودة فاتجاهلت (من رد الخادم). */
  deals: number
  dealsSkipped: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * تاريخ من خلية Excel: Date (خلية تاريخ)، أو رقم تسلسلي (خلية تاريخ من غير
 * تنسيق)، أو نص 2026-09-23 / 23/09/2026 / 23-9-2026. يرجّع YYYY-MM-DD أو null.
 */
function toIsoDate(value: unknown): string | null {
  let y: number, m: number, d: number
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // read-excel-file يرجّع التاريخ عند منتصف الليل UTC
    y = value.getUTCFullYear(); m = value.getUTCMonth() + 1; d = value.getUTCDate()
  } else if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Math.round((value - 25569) * 86400000))
    y = date.getUTCFullYear(); m = date.getUTCMonth() + 1; d = date.getUTCDate()
  } else {
    const text = toText(value)
    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (match) { y = +match[1]; m = +match[2]; d = +match[3] }
    else if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) { d = +match[1]; m = +match[2]; y = +match[3] }
    else return null
  }
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

function cairoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
}

export async function parseWorkbook(
  file: File,
): Promise<{ payload: WorkbookPayload; summary: ImportSummary }> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')

  // نداء واحد يرجّع كل الأوراق بأسمائها وبياناتها
  const sheets = await readXlsxFile(file)
  const find = (want: string) =>
    sheets.find((s) => s.sheet.trim().toLowerCase() === want) ??
    sheets.find((s) => s.sheet.trim().toLowerCase().includes(want))

  const teamsSheet = find('teams')
  const agentsSheet = find('agents')

  if (!agentsSheet) {
    const names = sheets.map((s) => s.sheet).join('، ')
    throw new Error(`لم أجد ورقة باسم Agents — الأوراق الموجودة: ${names || 'لا شيء'}`)
  }

  let skipped = 0
  const teams: WorkbookTeam[] = []

  if (teamsSheet) {
    const rows = teamsSheet.data as unknown[][]
    const index = headerIndex(rows[0] ?? [])
    for (const row of rows.slice(1, MAX_ROWS + 1)) {
      const name = toText(pick(row, index, 'name'))
      if (!name) { skipped++; continue }
      teams.push({
        name,
        name_ar: toText(pick(row, index, 'namear')) || null,
        photo_url: toText(pick(row, index, 'photo', 'photourl')) || null,
      })
    }
  }

  const agentRows = agentsSheet.data as unknown[][]
  const aIndex = headerIndex(agentRows[0] ?? [])
  const agents: WorkbookAgent[] = []
  let periods = 0

  for (const row of agentRows.slice(1, MAX_ROWS + 1)) {
    const name = toText(pick(row, aIndex, 'name'))
    if (!name) { skipped++; continue }

    const list: WorkbookPeriod[] = []
    for (const q of QUARTERS) {
      const target = toNumber(pick(row, aIndex, `q${q}target`))
      const deals = toNumber(pick(row, aIndex, `q${q}deals`))
      // ربع بلا هدف ولا مبيعات لا يُكتب له صف — نفس قاعدة مزامنة جوجل شيت
      if (target === 0 && deals === 0) continue
      list.push({ quarter: q, target, deals })
    }
    periods += list.length

    agents.push({
      name,
      name_ar: toText(pick(row, aIndex, 'namear')) || null,
      team: toText(pick(row, aIndex, 'team')) || null,
      photo_url: toText(pick(row, aIndex, 'photo', 'photourl')) || null,
      periods: list,
    })
  }

  const dealsSheet = find('deals')
  const deals: WorkbookDeal[] = []
  const errors: string[] = []

  if (dealsSheet) {
    const rows = dealsSheet.data as unknown[][]
    const index = headerIndex(rows[0] ?? [])
    const today = cairoToday()

    rows.slice(1, MAX_ROWS + 1).forEach((row, i) => {
      const rowNo = i + 2
      const agent = toText(pick(row, index, 'agent', 'name'))
      const rawDate = pick(row, index, 'date', 'dealdate')
      const rawAmount = pick(row, index, 'amountegp', 'amount')
      // صف فاضي تماماً يتجاهل بهدوء
      if (!agent && toText(rawDate) === '' && toText(rawAmount) === '') return

      const date = toIsoDate(rawDate)
      const amount = toNumber(rawAmount)
      // اسم مستشار غير معروف يرفضه الخادم برقم الصف — قد يكون في اللوحة لا في الملف
      if (!agent) errors.push(`الصف ${rowNo}: اسم المستشار (agent) فاضي`)
      if (!date) errors.push(`الصف ${rowNo}: التاريخ «${toText(rawDate)}» غير مفهوم — اكتبه 2026-09-23`)
      else if (date > today) errors.push(`الصف ${rowNo}: التاريخ ${date} في المستقبل`)
      if (!(amount > 0)) errors.push(`الصف ${rowNo}: المبلغ لازم يكون رقم أكبر من صفر`)

      if (agent && date && amount > 0) {
        deals.push({
          agent,
          date,
          amount,
          developer: toText(pick(row, index, 'developer')) || null,
          project: toText(pick(row, index, 'project')) || null,
          row: rowNo,
        })
      }
    })
  }

  if (errors.length) {
    const more = errors.length > 6 ? `\n… و${errors.length - 6} أخطاء أخرى` : ''
    throw new Error(`ورقة Deals فيها أخطاء — لم يُرفع شيء:\n${errors.slice(0, 6).join('\n')}${more}`)
  }

  if (!agents.length) throw new Error('لم أجد أي صف فيه اسم مستشار في ورقة Agents')

  return {
    payload: { teams, agents, deals },
    summary: { teams: teams.length, agents: agents.length, periods, skipped, deals: deals.length, dealsSkipped: 0 },
  }
}
