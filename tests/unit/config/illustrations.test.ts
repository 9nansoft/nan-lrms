// tests/unit/config/illustrations.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { HERO_ILLUSTRATION_SRC, ILLUSTRATION_SRC } from '@/config/illustrations';

const root = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'scripts/illustrations/manifest.json'), 'utf8')) as {
  model: string;
  style: string;
  items: Array<{ file: string; prompt: string; seed: number; aspect: string; transparent: boolean }>;
};

describe('illustration set', () => {
  it.each([...Object.values(ILLUSTRATION_SRC), ...Object.values(HERO_ILLUSTRATION_SRC)])('%s exists, ≤150 KB, and is in the manifest', (src) => {
    const file = path.join(root, 'public', src);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(150 * 1024);
    expect(manifest.items.some((i) => `/illustrations/${i.file}` === src)).toBe(true);
  });
  it('every manifest item records a fixed seed and forbids the red-cross emblem', () => {
    for (const i of manifest.items) {
      expect(Number.isInteger(i.seed) && i.seed > 0).toBe(true);
      expect(`${manifest.style} ${i.prompt}`).toMatch(/no red cross/i);
    }
  });
});
