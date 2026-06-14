/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

// This package is a React app, not a library. We rely on the bundler's built-in
// transform (rolldown-vite/oxc) with automatic JSX driven by tsconfig's "jsx":
// "react-jsx", rather than @vitejs/plugin-react, to keep the dependency footprint
// small and the install robust. The tradeoff is no React Fast Refresh in dev (a full
// reload happens instead), which is fine for a prototype.
export default defineConfig({
  resolve: {
    alias: {
      // scratch-paint's package.json sets "browser": "./src/index.js", which would make
      // vite bundle its raw source (PostCSS simple-vars + CSS modules — a toolchain we
      // don't reproduce). Point at the prebuilt UMD bundle instead (what scratch-gui's
      // webpack effectively uses); it injects its own compiled CSS at runtime.
      'scratch-paint': new URL('./node_modules/scratch-paint/dist/scratch-paint.js', import.meta.url).pathname,
    },
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
