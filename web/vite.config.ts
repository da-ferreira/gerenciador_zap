import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served under /zap/ by nginx: relative base keeps assets and api/ calls working.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3090' } },
})
