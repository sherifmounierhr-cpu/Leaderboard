import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * على Vercel بتتخدم دوال `api/*.ts` تلقائياً. خادم التطوير عنده ما فيش دوال،
 * فبنركّب نفس المنطق كوسيط عشان الشاشات تشتغل محلياً بالظبط.
 */
const DEV_ROUTES = [
  { path: '/api/news', module: '/api/news.ts', load: 'loadNews' },
  { path: '/api/markets', module: '/api/markets.ts', load: 'loadMarkets' },
] as const

function apiDevRoutes(): Plugin {
  return {
    name: 'everest-api-dev-routes',
    apply: 'serve',
    configureServer(server) {
      for (const route of DEV_ROUTES) {
        server.middlewares.use(route.path, (_req, res) => {
          void (async () => {
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.setHeader('cache-control', 'no-store')
            try {
              const mod = (await server.ssrLoadModule(route.module)) as Record<string, () => Promise<unknown>>
              res.end(JSON.stringify(await mod[route.load]()))
            } catch (err) {
              res.statusCode = 502
              res.end(JSON.stringify({
                items: [],
                quotes: [],
                fetchedAt: new Date().toISOString(),
                stale: true,
                error: err instanceof Error ? err.message : 'unavailable',
              }))
            }
          })()
        })
      }
    },
  }
}

/**
 * سياسة أمان المحتوى في نسخة البناء فقط (خادم التطوير يحتاج سكربتات HMR).
 * GitHub Pages لا يسمح بترويسات، فتُضاف كـ <meta>. السكربتات من نفس الموقع
 * فقط: أي سكربت محقون من بيانات (اسم، خبر، رسالة) لا يعمل.
 * الصور والصوت من أي https لأن الأخبار وصور Drive من مصادر خارجية.
 */
function contentSecurityPolicy(): Plugin {
  let supabase = ''
  return {
    name: 'everest-csp',
    apply: 'build',
    // من .env.local محلياً أو أسرار GitHub Actions — كلاهما يصل عبر config.env
    configResolved(config) {
      supabase = String(config.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
    },
    transformIndexHtml() {
      const realtime = supabase.replace(/^https:/, 'wss:')
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' blob: https:",
        [
          "connect-src 'self'", supabase, realtime,
          'https://api.pwnedpasswords.com', 'https://api.github.com',
          'https://dashboard.everest-realestate.net',
          'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
          'https://api.iconify.design', 'https://api.simplesvg.com', 'https://api.unisvg.com',
        ].filter(Boolean).join(' '),
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
      ]
    },
  }
}

export default defineConfig({
  // مساره على GitHub Pages فرعي (github.io/Leaderboard)، فيحتاج base صريح عند البناء هناك فقط
  base: process.env.GITHUB_ACTIONS ? '/Leaderboard/' : '/',
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // <iconify-icon> is a custom element, not a Vue component
          isCustomElement: (tag) => tag === 'iconify-icon',
        },
      },
    }),
    tailwindcss(),
    apiDevRoutes(),
    contentSecurityPolicy(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
