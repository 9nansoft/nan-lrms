import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // next-auth is CommonJS and its entry does `require('next/server')`,
    // which Node cannot resolve (Next ships it as next/server.js with no
    // exports map). Inlining next-auth lets Vite process it, so the alias
    // below applies.
    server: {
      deps: {
        inline: ['next-auth'],
      },
    },
    // PGlite (embedded Postgres, WASM) boots in ~2-3s idle but can exceed 5s
    // when the whole suite saturates the CPU. Files pay that cost once, on
    // their first DB touch — which may sit inside a test body, not a hook.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '.next/', 'src/components/ui/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // next-auth's CJS entry does `require('next/server')`, and Next 15
      // ships that entry as `next/server.js` with no exports map — Node's
      // ESM resolver cannot find it, so any test that pulls in next-auth
      // (directly or through a route handler) fails to load. Point the
      // bare specifier at the file Next itself uses.
      'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
    },
  },
});
