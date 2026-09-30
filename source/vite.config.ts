import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

// Every build is stamped with the game version and a unique build id (in the page's
// <meta> tags and in the code), so a hosted copy can tell when a newer one is online.
const VERSION = /GAME_VERSION = '([^']+)'/.exec(readFileSync(new URL('./src/world/constants.ts', import.meta.url), 'utf8'))?.[1] ?? '0';
function stamp(build: string): Plugin {
  return {
    name: 'blockfell-stamp',
    transformIndexHtml: (html) => html.replace(/%BLOCKFELL_VERSION%/g, VERSION).replace(/%BLOCKFELL_BUILD%/g, build),
  };
}

// `vite build --mode single` emits one self-contained HTML file (worker, font and
// all code inlined) that can be opened directly from disk or hosted anywhere.
export default defineConfig(({ mode, command }) => {
  const build = command === 'build' ? `${VERSION}-${Date.now().toString(36)}` : 'dev';
  return {
  base: './',
  define: { __BUILD_ID__: JSON.stringify(build) },
  plugins: [react(), stamp(build), ...(mode === 'single' ? [viteSingleFile()] : [])],
  worker: { format: 'iife' },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // Safari 15 (iOS/iPadOS 15) can't parse class static blocks: esbuild lowers them
    target: ['es2022', 'safari15'],
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true, port: 5173 },
  };
});
