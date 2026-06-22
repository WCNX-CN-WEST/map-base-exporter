import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone map framer/exporter — no PWA, no service worker.
export default defineConfig({
  base: './',
  plugins: [react()],
})
