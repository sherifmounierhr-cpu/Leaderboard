import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadNews } from './_news'

/**
 * GET /api/news — آخر 10 مقالات من مدونة إيفرست، منظّفة وجاهزة للعرض.
 * الجلب هنا (على السيرفر) لا في المتصفح: نطاق المدونة مختلف فما بيسمحش بـ CORS.
 */
export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  try {
    const payload = await loadNews()
    // الـ CDN يخدم نفس النسخة 10 دقائق، ويقدّم القديمة ساعة لو المصدر وقع
    res.setHeader('cache-control', 'public, s-maxage=600, stale-while-revalidate=3600')
    res.statusCode = 200
    res.end(JSON.stringify(payload))
  } catch (err) {
    res.setHeader('cache-control', 'no-store')
    res.statusCode = 502
    res.end(JSON.stringify({
      items: [],
      fetchedAt: new Date().toISOString(),
      stale: true,
      error: err instanceof Error ? err.message : 'news unavailable',
    }))
  }
}
