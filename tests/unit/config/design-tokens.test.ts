// tests/unit/config/design-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COLOR,
  STATUS,
  CONTRAST_PAIRS,
  cssVarName,
  contrastRatio,
  withAlpha,
  type ColorToken,
} from '@/config/design-tokens';

const css = readFileSync(path.resolve(__dirname, '../../../src/app/globals.css'), 'utf8');
const rootStart = css.indexOf(':root {');
const rootBlock = css.slice(rootStart, css.indexOf('}', rootStart));

describe('design tokens', () => {
  it('cssVarName converts camelCase to a CSS custom property', () => {
    expect(cssVarName('riskHighText')).toBe('--risk-high-text');
    expect(cssVarName('surfacePage')).toBe('--surface-page');
    expect(cssVarName('border')).toBe('--border');
  });

  it.each(Object.entries(COLOR))('%s is mirrored in :root with the same hex', (token, hex) => {
    const name = cssVarName(token as ColorToken);
    const m = rootBlock.match(new RegExp(`\\s${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
    expect(m?.[1].toUpperCase()).toBe(hex);
  });

  it.each(Object.keys(COLOR))('%s is exposed as a Tailwind colour', (token) => {
    const name = cssVarName(token as ColorToken).slice(2);
    expect(css).toContain(`--color-${name}: var(--${name});`);
  });

  it.each(Object.entries(STATUS))('status %s aliases %s (marker, text, tint)', (status, risk) => {
    const r = cssVarName(risk as ColorToken);
    expect(rootBlock).toContain(`--${status}: var(${r});`);
    expect(rootBlock).toContain(`--${status}-text: var(${r}-text);`);
    expect(rootBlock).toContain(`--${status}-tint: var(${r}-tint);`);
    for (const suffix of ['', '-text', '-tint']) {
      expect(css).toContain(`--color-${status}${suffix}: var(--${status}${suffix});`);
    }
  });

  it.each(CONTRAST_PAIRS)('%s on %s meets WCAG AA (≥4.5:1)', (fg, bg) => {
    expect(contrastRatio(COLOR[fg], COLOR[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('contrastRatio matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('shadcn primitives follow the tokens', () => {
    expect(rootBlock).toContain('--background: var(--surface-page);');
    expect(rootBlock).toContain('--primary: var(--brand);');
    expect(rootBlock).toContain('--destructive: var(--risk-high);');
  });

  it('legacy palettes are aliases, not separate colours', () => {
    expect(rootBlock).toContain('--primary-teal: var(--brand);');
    expect(rootBlock).toContain('--accent-navy: var(--brand);');
    expect(rootBlock).toContain('--ink-navy: var(--ink);');
  });
});

describe('withAlpha', () => {
  it('turns a token hex into rgba', () => {
    expect(withAlpha('#2E3A87', 0.06)).toBe('rgba(46, 58, 135, 0.06)');
    expect(withAlpha(COLOR.surfaceCard, 0.92)).toBe('rgba(255, 255, 255, 0.92)');
  });
});
