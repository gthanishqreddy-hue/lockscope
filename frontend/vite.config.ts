/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
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

/** Public repository URL for documentation links: VITE_REPO_URL, or derived on Vercel. */
function repoUrl(): string {
  if (process.env.VITE_REPO_URL) return process.env.VITE_REPO_URL;
  const { VERCEL_GIT_PROVIDER, VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG } = process.env;
  if (VERCEL_GIT_PROVIDER === 'github' && VERCEL_GIT_REPO_OWNER && VERCEL_GIT_REPO_SLUG) {
    return `https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}`;
  }
  return '';
}

/**
 * Hosts that cannot send response headers (GitHub Pages) get the Content-Security-Policy as a
 * <meta> tag instead (CSP_META=1). Same policy as public/_headers, minus frame-ancestors, which
 * browsers ignore in <meta>. Production builds only: the dev server needs inline scripts.
 */
function cspMeta(): Plugin {
  const policy =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:*; base-uri 'self'; form-action 'none'";
  return {
    name: 'lockscope-csp-meta',
    apply: 'build',
    transformIndexHtml: () =>
      process.env.CSP_META === '1'
        ? [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
              injectTo: 'head-prepend',
            },
          ]
        : [],
  };
}

// BASE_PATH lets the dashboard be served from a sub-path (e.g. GitHub Pages project sites).
// Mode 'desktop' (npm run build:desktop) builds the copy that the desktop app's engine serves.
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspMeta()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_COMMIT__: JSON.stringify(
      (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA)?.slice(
        0,
        7,
      ) ?? gitCommit(),
    ),
    __REPO_URL__: JSON.stringify(repoUrl()),
    __BUNDLED_WITH_ENGINE__: JSON.stringify(mode === 'desktop'),
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
}));
