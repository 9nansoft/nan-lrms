// tests/unit/ui/admin-auth-migration.test.ts
// Sub-project 5 guard: files migrated to the direction-C tokens must not drift
// back to the retired navy/ATC vocabulary. The lint rule allows neutral greys
// and does not know the legacy alias variables or Tailwind 4's comma trap, so
// this test checks them. Each task appends its files BEFORE migrating them
// (red), then migrates them (green). Never remove a file from this list.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

export const MIGRATED: string[] = [
  'src/app/(auth)/login/page.tsx',
  'src/components/auth/LoginHero.tsx',
  'src/components/auth/AccessDeniedNotice.tsx',
  'src/components/auth/HosxpVersionDialog.tsx',
  'src/app/about/page.tsx',
  'src/components/about/AboutHeader.tsx',
  'src/components/about/about-blocks.tsx',
  'src/components/about/WebhookApiSection.tsx',
  'src/components/about/about-tables.tsx',
  'src/app/(hospital)/profile/page.tsx',
  'src/components/profile/NotificationPreferenceCard.tsx',
  'src/app/(provincial)/admin/page.tsx',
  'src/components/admin/HospitalsTab.tsx',
  'src/components/admin/ActiveProvinceTab.tsx',
  'src/components/admin/BulkAddHospitalsDialog.tsx',
  'src/components/admin/AdminMapPane.tsx',
  'src/components/admin/admin-ui.tsx',
  'src/components/admin/SyncOverviewTab.tsx',
  'src/components/admin/OnlineUsersTab.tsx',
  'src/components/admin/WebhookKeysTab.tsx',
  'src/components/admin/MophAlertsTab.tsx',
  'src/components/admin/BmsConfigTab.tsx',
  'src/components/admin/HospitalEditDialog.tsx',
  'src/components/admin/SimulationTab.tsx',
  'src/components/dashboard/SimulationControl.tsx',
];

type Rule = [name: string, offends: (line: string) => boolean];
const RULES: Rule[] = [
  ['legacy alias variable', (l) => /var\(--(?:ink-navy|rule\b|rule-|accent-navy|surface-cool|primary-teal)/.test(l)],
  ['legacy alias class', (l) => /\b(?:text|bg|border|ring)-(?:ink-navy|accent-navy|surface-cool|rule-strong|rule-hair|primary-teal)/.test(l)],
  ['hex colour', (l) => /#[0-9a-fA-F]{3,8}\b/.test(l)],
  ['css zoom', (l) => /\bzoom:\s*[\d.]/.test(l)],
  ['uppercase eyebrow', (l) => /\buppercase\b/.test(l)],
  ['slate palette', (l) => /\b(?:bg|text|border|from|via|to|ring|divide)-slate-\d/.test(l)],
  // Opacity on a contrast-checked *-text token defeats the AA pairing.
  ['opacity on -text token', (l) => /\btext-[a-z]+-text\/\d/.test(l)],
  // Tailwind 4 keeps commas literally: grid-cols-[90px,1fr] → invalid CSS (B1).
  ['comma grid template', (l) =>
    [...l.matchAll(/grid-cols-\[([^\]]*)\]/g)].some((m) => m[1].replace(/\([^)]*\)/g, '').includes(','))],
];

describe('admin-auth migration guard', () => {
  it('the guard rules catch what they claim to', () => {
    const offends = (s: string) => RULES.filter(([, f]) => f(s)).map(([n]) => n);
    expect(offends("className=\"grid-cols-[90px,1fr]\"")).toEqual(['comma grid template']);
    expect(offends("className=\"grid-cols-[minmax(0,1fr)_420px]\"")).toEqual([]);
    expect(offends("style={{ color: 'var(--ink-navy)' }}")).toEqual(['legacy alias variable']);
    expect(offends('href="#features"')).toEqual([]);
  });
  it.each(MIGRATED.length ? MIGRATED : ['(none yet)'])('%s uses only direction-C vocabulary', (file) => {
    if (file === '(none yet)') return;
    const lines = readFileSync(file, 'utf8').split('\n');
    const hits: string[] = [];
    lines.forEach((line, i) => {
      for (const [name, offends] of RULES) if (offends(line)) hits.push(`${i + 1} ${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
