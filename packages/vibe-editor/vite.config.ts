/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// This package is a React app, not a library. We rely on Vite's built-in esbuild
// transform (automatic JSX runtime) rather than @vitejs/plugin-react to keep the
// dependency footprint small and the install robust. The tradeoff is no React Fast
// Refresh in dev (a full reload happens instead), which is fine for a prototype.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 8602,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // CSS is irrelevant to behavior tests; skip processing it for speed/stability.
    css: false,
    reporters: ['default'],
  },
})
