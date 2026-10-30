/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

// BASE_PATH lets the dashboard be served from a sub-path (e.g. GitHub Pages project sites).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? gitCommit()),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'charts';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
