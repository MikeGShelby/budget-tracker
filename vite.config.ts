/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages serves this repo from /budget-tracker/; Cloudflare Pages (and
  // `npm run dev`) serve it from the root. Keeping the base in an env var means
  // moving hosts is a workflow edit, not a code change.
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    // Capacitor serves the build from the app bundle, so keep paths relative.
    assetsDir: 'assets',
    target: 'es2022',
sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
