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
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
