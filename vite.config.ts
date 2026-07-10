import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { nasBridgePlugin } from './scripts/vite-nas-bridge.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss(), nasBridgePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    open: true,
  },
  build: {
    sourcemap: true,
  },
})
