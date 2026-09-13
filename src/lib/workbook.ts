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

export interface WorkbookPayload {
  teams: WorkbookTeam[]
  agents: WorkbookAgent[]
}

const QUARTERS = [1, 2, 3, 4] as const

/** حد أمان: ملف ضخم بالخطأ لا يجب أن يعلّق المتصفح أو يغرق القاعدة. */
const MAX_ROWS = 5000

// --------------------------------------------------------------------- تصدير

/** صف الترويسة بخط عريض، والأرقام كأرقام حقيقية لا نصوص. */
function toCells(rows: (string | number)[][]) {
  return rows.map((row, r) =>
    row.map((value) => ({
      value,
      fontWeight: r === 0 ? ('bold' as const) : undefined,
      type: typeof value === 'number' ? Number : String,
    })),
  )
}

export async function exportWorkbook(payload: WorkbookPayload, year: number) {
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

  // الترويسات إنجليزية لأنها عقد أعمدة sheets-sync، فتُترك الورقة يسار-يمين
  await writeXlsxFile([
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
  ]).toFile(`Everest-Leaderboard-${year}.xlsx`)
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

  if (!agents.length) throw new Error('لم أجد أي صف فيه اسم مستشار في ورقة Agents')

  return { payload: { teams, agents }, summary: { teams: teams.length, agents: agents.length, periods, skipped } }
}
