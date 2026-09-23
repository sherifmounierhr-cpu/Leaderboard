import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * GET /api/markets — أسعار الذهب والمعادن والدولار والبورصة وأسهم التطوير
 * العقاري، لشاشة الأسواق.
 *
 * المصدر ياهو فاينانس (من غير مفتاح). الطلب من السيرفر لأن ياهو ما بيسمحش
 * بـ CORS، وعشان نعمل الطلبات مرة واحدة ونكاشها بدل ما كل شاشة تعملها لوحدها.
 *
 * كل المنطق في ملف واحد عن قصد: الاستيراد النسبي بين ملفات api بيفشل وقت
 * التشغيل على Vercel.
 */

const TTL_MS = 2 * 60_000
const TIMEOUT_MS = 10_000
/** أونصة تروي بالجرام — لتحويل سعر الذهب العالمي لجرام محلي. */
const OUNCE_G = 31.1034768
const KARAT_21 = 21 / 24

interface Spec {
  key: string
  symbol: string
  group: 'metals' | 'egypt' | 'global'
  /** وحدة العرض، للتمييز بين الأونصة والرطل والبرميل. */
  unit?: string
}

const SPECS: Spec[] = [
  { key: 'usdegp', symbol: 'EGP=X', group: 'egypt' },
  { key: 'gold', symbol: 'GC=F', group: 'metals', unit: 'oz' },
  { key: 'silver', symbol: 'SI=F', group: 'metals', unit: 'oz' },
  { key: 'copper', symbol: 'HG=F', group: 'metals', unit: 'lb' },
  { key: 'oil', symbol: 'CL=F', group: 'metals', unit: 'bbl' },
  { key: 'egx30', symbol: '^CASE30', group: 'egypt' },
  { key: 'tmgh', symbol: 'TMGH.CA', group: 'egypt' },
  { key: 'phdc', symbol: 'PHDC.CA', group: 'egypt' },
  { key: 'ocdi', symbol: 'OCDI.CA', group: 'egypt' },
  { key: 'heli', symbol: 'HELI.CA', group: 'egypt' },
  { key: 'reet', symbol: 'REET', group: 'global' },
  { key: 'vnq', symbol: 'VNQ', group: 'global' },
  { key: 'vnqi', symbol: 'VNQI', group: 'global' },
  { key: 'iyr', symbol: 'IYR', group: 'global' },
  { key: 'xlre', symbol: 'XLRE', group: 'global' },
]

export interface Quote {
  key: string
  symbol: string
  group: string
  /** rate = قرار يتعرض دايماً، price = سعر سوق يتعرض لما يتحرّك. */
  kind?: 'rate'
  /** نطاق القرار لو ليه حدّين، زي الفيدرالي الأمريكي. */
  band?: [number, number]
  currency: string
  unit?: string
  price: number
  prev: number
  changePct: number
  /** إغلاقات آخر شهر، لخط الاتجاه الصغير. */
  spark: number[]
}

export interface MarketsPayload {
  quotes: Quote[]
  fetchedAt: string
  stale: boolean
}

async function yahoo(spec: Spec): Promise<Quote | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const base = 'https://query1.finance.yahoo.com/v8/finance/chart/'
    const res = await fetch(base + encodeURIComponent(spec.symbol) + '?range=1mo&interval=1d', {
      signal: abort.signal,
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 EverestLeaderboard/1.0' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as any
    const result = body?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta ?? {}
    const raw: unknown[] = result.indicators?.quote?.[0]?.close ?? []
    const closes = raw.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    /*
     * آخر إغلاق يومي هو المرجع، مش regularMarketPrice: ده بيرجع قيمة بايتة
     * على بعض أسهم البورصة المصرية فبيقلب نسبة التغيّر رأساً على عقب.
     */
    const price = closes.length ? closes[closes.length - 1] : Number(meta.regularMarketPrice)
    const prev = closes.length > 1 ? closes[closes.length - 2] : Number(meta.chartPreviousClose)
    if (!Number.isFinite(price) || !Number.isFinite(prev) || price <= 0 || prev <= 0) return null

    return {
      key: spec.key,
      symbol: spec.symbol,
      group: spec.group,
      currency: String(meta.currency ?? 'USD'),
      unit: spec.unit,
      price,
      prev,
      changePct: ((price - prev) / prev) * 100,
      spark: closes.slice(-22),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** سعر جرام الذهب عيار 21 بالجنيه — محسوب من الأونصة العالمية وسعر الدولار. */
function gold21(quotes: Quote[]): Quote | null {
  const gold = quotes.find((q) => q.key === 'gold')
  const usd = quotes.find((q) => q.key === 'usdegp')
  if (!gold || !usd) return null
  const toGram = (ounce: number, rate: number) => (ounce / OUNCE_G) * rate * KARAT_21
  const price = toGram(gold.price, usd.price)
  const prev = toGram(gold.prev, usd.prev)
  return {
    key: 'gold21',
    symbol: 'XAU21-EGP',
    group: 'metals',
    currency: 'EGP',
    unit: 'g',
    price,
    prev,
    changePct: ((price - prev) / prev) * 100,
    spark: gold.spark.map((v) => toGram(v, usd.price)),
  }
}

/**
 * سعر الفائدة الفيدرالي الأمريكي من FRED (بنك سانت لويس الاحتياطي) — CSV
 * عام بدون مفتاح. بنجيب حد النطاق الأعلى والأدنى، والقرار بيتغيّر ٨ مرات
 * في السنة فالتغيّر اليومي بصفر في أغلب الأيام وده طبيعي.
 */
const FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id='

/** آخر قيمة رقمية في ملف FRED: تاريخ,قيمة في كل سطر. */
async function fredLast(series: string, signal: AbortSignal): Promise<number | null> {
  const res = await fetch(FRED + series, { signal, headers: { accept: 'text/csv' } })
  if (!res.ok) return null
  const text = await res.text()
  const lines = text.trim().split('\n')
  for (let i = lines.length - 1; i > 0; i--) {
    const value = Number(lines[i].split(',')[1])
    if (Number.isFinite(value)) return value
  }
  return null
}

async function fedRate(): Promise<Quote | null> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
  try {
    const [upper, lower] = await Promise.all([
      fredLast('DFEDTARU', abort.signal),
      fredLast('DFEDTARL', abort.signal),
    ])
    if (upper === null) return null
    return {
      key: 'fedrate',
      symbol: 'FEDFUNDS',
      group: 'rates',
      kind: 'rate',
      currency: '%',
      band: lower === null ? undefined : [lower, upper],
      price: upper,
      prev: upper,
      changePct: 0,
      spark: [],
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

let cache: { payload: MarketsPayload; at: number } | null = null
let inFlight: Promise<MarketsPayload> | null = null

async function fetchFresh(): Promise<MarketsPayload> {
  const [results, fed] = await Promise.all([Promise.all(SPECS.map(yahoo)), fedRate()])
  const quotes = results.filter((q): q is Quote => q !== null)
  if (!quotes.length) throw new Error('markets: no quotes')
  const derived = gold21(quotes)
  // جرام الذهب أهم رقم للناس هنا، فيتحط الأول، وسعر الفائدة وراه
  return {
    quotes: [...(derived ? [derived] : []), ...(fed ? [fed] : []), ...quotes],
    fetchedAt: new Date().toISOString(),
    stale: false,
  }
}

export async function loadMarkets(): Promise<MarketsPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.payload
  if (!inFlight) {
    inFlight = fetchFresh()
      .then((payload) => {
        cache = { payload, at: Date.now() }
        return payload
      })
      .finally(() => {
        inFlight = null
      })
  }
  try {
    return await inFlight
  } catch (err) {
    if (cache) return { ...cache.payload, stale: true }
    throw err
  }
}

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  try {
    const payload = await loadMarkets()
    res.setHeader('cache-control', 'public, max-age=0, must-revalidate, s-maxage=120, stale-while-revalidate=600')
    res.statusCode = 200
    res.end(JSON.stringify(payload))
  } catch (err) {
    res.setHeader('cache-control', 'no-store')
    res.statusCode = 502
    res.end(
      JSON.stringify({
        quotes: [],
        fetchedAt: new Date().toISOString(),
        stale: true,
        error: err instanceof Error ? err.message : 'markets unavailable',
      }),
    )
  }
}
