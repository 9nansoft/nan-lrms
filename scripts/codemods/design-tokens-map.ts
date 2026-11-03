// scripts/codemods/design-tokens-map.ts
// Pure mapping for the one-shot design-token codemod (spec §5). Imported by
// the runner (design-tokens.mjs) and by tests; no I/O here.
const SIZE_BUCKETS: ReadonlyArray<{ max: number; token: string }> = [
  { max: 13.99, token: 'text-caption' }, // 9–12px are bumped to the 13px floor
  { max: 14.99, token: 'text-label' },
  { max: 15.99, token: 'text-body' },
  { max: 17.99, token: 'text-body-lg' },
  { max: 23.99, token: 'text-title' },
  { max: 29.99, token: 'text-page' },
  { max: Number.POSITIVE_INFINITY, token: 'text-kpi' },
];

export function mapFontSizePx(px: number): string {
  return (SIZE_BUCKETS.find((b) => px <= b.max) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1]).token;
}

const HUE: Record<string, 'danger' | 'warn' | 'ok' | 'brand'> = {
  red: 'danger',
  rose: 'danger',
  orange: 'warn',
  amber: 'warn',
  yellow: 'warn',
  green: 'ok',
  emerald: 'ok',
  teal: 'brand',
};

const SIMPLE_PROPS = new Set(['ring', 'fill', 'stroke', 'outline', 'decoration', 'divide', 'accent', 'caret']);

export function mapColorClass(prop: string, hue: string, shade: number): string | null {
  const s = HUE[hue];
  if (!s) return null;
  if (s === 'brand') {
    if (prop === 'bg') return shade <= 100 ? 'bg-brand-soft' : 'bg-brand';
    if (prop === 'text') return 'text-brand';
    if (prop === 'border') return shade <= 200 ? 'border-brand-soft' : 'border-brand';
    return SIMPLE_PROPS.has(prop) ? `${prop}-brand` : null;
  }
  if (prop === 'bg') return shade <= 300 ? `bg-${s}-tint` : `bg-${s}`;
  if (prop === 'text') return shade <= 500 ? `text-${s}` : `text-${s}-text`;
  if (prop === 'border') return shade <= 300 ? `border-${s}/40` : `border-${s}`;
  if (!SIMPLE_PROPS.has(prop)) return null;
  // Light shades (ring-red-100/200) are faint edges; keep them faint, like border.
  return shade <= 300 && prop !== 'fill' && prop !== 'stroke' ? `${prop}-${s}/40` : `${prop}-${s}`;
}

const PREFIX = '((?:[a-z0-9-]+:)*)';
const SIZE_RE = new RegExp(`(?<![\\w-])${PREFIX}text-\\[(\\d+(?:\\.\\d+)?)px\\](?![\\w-])`, 'g');
const COLOR_RE = new RegExp(
  `(?<![\\w-])${PREFIX}(bg|text|border|ring|fill|stroke|outline|decoration|divide|accent|caret|from|via|to)-` +
    `(red|rose|orange|amber|yellow|green|emerald|teal)-(\\d{2,3})(\\/\\d{1,3})?(?![\\w-])`,
  'g',
);
const MANUAL_RE = /(?<![\w-])(?:[a-z0-9-]+:)*(?:text-\[\d+(?:\.\d+)?rem\]|[a-z]+-\[#[0-9a-fA-F]{3,8}\])/g;

export interface RewriteResult {
  output: string;
  sizeCount: number;
  colorCount: number;
  manual: string[];
}

export function rewriteSource(src: string): RewriteResult {
  let sizeCount = 0;
  let colorCount = 0;
  const manual: string[] = [];
  let out = src.replace(SIZE_RE, (_m, variants: string, px: string) => {
    sizeCount += 1;
    return `${variants}${mapFontSizePx(Number(px))}`;
  });
  out = out.replace(COLOR_RE, (m, variants: string, prop: string, hue: string, shade: string, op?: string) => {
    const mapped = mapColorClass(prop, hue, Number(shade));
    if (!mapped) {
      manual.push(m);
      return m;
    }
    colorCount += 1;
    // A light-shade edge already mapped to `/40`: an explicit opacity scales that
    // faintness (x0.4) instead of replacing it, e.g. ring-rose-200/60 -> ring-danger/24.
    const base = op
      ? mapped.includes('/')
        ? `${mapped.split('/')[0]}/${Math.round(Number(op.slice(1)) * 0.4)}`
        : mapped + op
      : mapped;
    return `${variants}${base}`;
  });
  for (const m of out.match(MANUAL_RE) ?? []) manual.push(m);
  return { output: out, sizeCount, colorCount, manual };
}
