// tests/unit/scripts/design-tokens-map.test.ts
import { describe, it, expect } from 'vitest';
import { mapFontSizePx, mapColorClass, rewriteSource } from '../../../scripts/codemods/design-tokens-map';

describe('mapFontSizePx', () => {
  it.each([
    [9, 'text-caption'], [10, 'text-caption'], [11, 'text-caption'], [12, 'text-caption'], [13, 'text-caption'],
    [14, 'text-label'], [15, 'text-body'], [16, 'text-body-lg'], [17, 'text-body-lg'],
    [18, 'text-title'], [22, 'text-title'], [24, 'text-page'], [28, 'text-page'], [30, 'text-kpi'], [48, 'text-kpi'],
  ])('%ipx → %s', (px, token) => expect(mapFontSizePx(px)).toBe(token));
});

describe('mapColorClass', () => {
  it.each([
    ['bg', 'red', 50, 'bg-danger-tint'], ['bg', 'red', 600, 'bg-danger'],
    ['text', 'red', 500, 'text-danger'], ['text', 'red', 700, 'text-danger-text'],
    ['border', 'amber', 200, 'border-warn/40'], ['border', 'amber', 500, 'border-warn'],
    ['bg', 'emerald', 100, 'bg-ok-tint'], ['text', 'green', 800, 'text-ok-text'],
    ['bg', 'teal', 50, 'bg-brand-soft'], ['bg', 'teal', 600, 'bg-brand'], ['text', 'teal', 700, 'text-brand'],
    ['fill', 'rose', 500, 'fill-danger'],
    ['ring', 'red', 100, 'ring-danger/40'], ['ring', 'amber', 500, 'ring-warn'],
  ])('%s-%s-%i → %s', (prop, hue, shade, out) => expect(mapColorClass(prop, hue, shade)).toBe(out));
  it('gradients and unknown hues are left for manual review', () => {
    expect(mapColorClass('from', 'red', 500)).toBeNull();
    expect(mapColorClass('bg', 'slate', 100)).toBeNull();
  });
});

describe('rewriteSource', () => {
  it('rewrites sizes and colours, keeping variants and opacity modifiers', () => {
    const src = `<div className="text-[11px] md:text-[14px] hover:bg-red-50 bg-amber-500/20 text-slate-500">`;
    const r = rewriteSource(src);
    expect(r.output).toBe(`<div className="text-caption md:text-label hover:bg-danger-tint bg-warn/20 text-slate-500">`);
    expect(r.sizeCount).toBe(2);
    expect(r.colorCount).toBe(2);
  });
  it('scales an explicit opacity on light-shade edges instead of dropping the /40', () => {
    expect(rewriteSource('"ring-rose-200/60"').output).toBe('"ring-danger/24"');
    expect(rewriteSource('"border-amber-200/50"').output).toBe('"border-warn/20"');
    expect(rewriteSource('"ring-red-500/60"').output).toBe('"ring-danger/60"');
    expect(rewriteSource('"bg-amber-500/20"').output).toBe('"bg-warn/20"');
  });
  it('does not touch look-alikes', () => {
    const src = `const a = "context-[11px]"; const b = "bg-red-500x";`;
    expect(rewriteSource(src).output).toBe(src);
  });
  it('reports gradients, rem sizes and arbitrary hex as manual', () => {
    const r = rewriteSource(`"from-red-500 text-[0.75rem] bg-[#ff0000]"`);
    expect(r.output).toBe(`"from-red-500 text-[0.75rem] bg-[#ff0000]"`);
    expect(r.manual).toEqual(['from-red-500', 'text-[0.75rem]', 'bg-[#ff0000]']);
  });
});
