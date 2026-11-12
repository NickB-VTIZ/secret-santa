import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lokaal: `npm run dev:server` (poort 3000) + `npm run dev:client` (poort 5173, proxy naar de API)
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2019',
  },
})
