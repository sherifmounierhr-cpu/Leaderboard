import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

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
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
