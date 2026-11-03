import nextConfig from 'eslint-config-next';
import { readFileSync } from 'node:fs';
import noAdhocDesignValues from './eslint-rules/no-adhoc-design-values.mjs';

const designAllowlist = JSON.parse(
  readFileSync(new URL('./eslint-rules/design-allowlist.json', import.meta.url), 'utf8'),
);

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['node_modules/', '.next/', '.claude/', '.superpowers/', 'dist/', 'build/', 'coverage/', '*.min.js'],
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    // Escape glob metacharacters so Next.js dynamic-route paths like [id] match literally.
    ignores: Object.keys(designAllowlist.files).map((f) => f.replace(/[[\]]/g, (c) => `\\${c}`)),
    plugins: { 'kk-design': { rules: { 'no-adhoc-design-values': noAdhocDesignValues } } },
    rules: { 'kk-design/no-adhoc-design-values': 'error' },
  },
];

export default eslintConfig;
