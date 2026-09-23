import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * على Vercel بيخدم /api/news من `api/news.ts` تلقائياً. خادم التطوير عنده
 * ما فيش دوال، فبنركّب نفس المنطق كوسيط عشان الشريط يشتغل محلياً بالظبط.
 */
function newsDevApi(): Plugin {
  return {
    name: 'everest-news-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/news', (_req, res) => {
        void (async () => {
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          try {
            const { loadNews } = (await server.ssrLoadModule('/api/news.ts')) as typeof import('./api/news')
            res.end(JSON.stringify(await loadNews()))
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({
              items: [],
              fetchedAt: new Date().toISOString(),
              stale: true,
              error: err instanceof Error ? err.message : 'news unavailable',
            }))
          }
        })()
      })
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
    newsDevApi(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
