// tests/unit/config/ward-design-debt.test.ts
// Sub-project 3's owned files may not drift back to ad-hoc design values or
// English mono styling. Comments are stripped before scanning.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const wardDir = 'src/components/maternity/ward';
const WARD_FILES = [
  'src/app/(hospital)/hospital-maternity-ward/page.tsx',
  'src/components/maternity/BedTileFull.tsx',
  'src/components/maternity/WardLayoutViewFull.tsx',
  'src/components/maternity/PatientDrawer.tsx',
  'src/components/maternity/BedMoveReasonModal.tsx',
  ...readdirSync(path.join(root, wardDir)).map((f) => `${wardDir}/${f}`),
];
const PATIENT_FILES: string[] = [
  'src/components/patient/PatientHeader.tsx',
  'src/components/patient/StickyPatientHeader.tsx',
  'src/components/patient/ReferralBanner.tsx',
  'src/components/patient/QuickStatsBar.tsx',
  'src/components/patient/CurrentVitalsPanel.tsx',
  'src/components/patient/LaborProgressCard.tsx',
  'src/components/patient/ClinicalData.tsx',
  'src/components/patient/CpdFactorBreakdown.tsx',
  'src/components/patient/AlertSummaryPanel.tsx',
  'src/app/(provincial)/patients/[an]/page.tsx',
  ...readdirSync(path.join(root, 'src/components/patient/detail')).map((f) => `src/components/patient/detail/${f}`),
];


const BANNED: Array<[string, RegExp]> = [
  ['hex literal', /#[0-9a-fA-F]{3,8}\b/],
  ['slate class', /\bslate-\d/],
  ['inline zoom', /\bzoom\s*:/],
  ['uppercase', /\buppercase\b/],
  ['font-mono', /\bfont-mono\b/],
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('sub-project 3 owned files use tokens only', () => {
  it.each([...WARD_FILES, ...PATIENT_FILES])('%s', (file) => {
    const src = stripComments(readFileSync(path.join(root, file), 'utf8'));
    expect(BANNED.filter(([, re]) => re.test(src)).map(([name]) => name)).toEqual([]);
  });

  // Fix wave minor 6: 'brand' is a StatusTone; no file re-adds it or special-cases its classes.
  it.each([...WARD_FILES, ...PATIENT_FILES])('%s has no StatusTone | \'brand\' workaround', (file) => {
    const src = stripComments(readFileSync(path.join(root, file), 'utf8'));
    expect(src).not.toMatch(/StatusTone\s*\|\s*'brand'/);
    expect(src).not.toMatch(/tone\s*===\s*'brand'\s*\?/);
  });

  // Fix wave minor 5: the GA band tone comes from classifyGaTerm, not restated cut-offs.
  it('QuickStatsBar does not restate the GA 34/37/41 cut-offs', () => {
    const src = stripComments(readFileSync(path.join(root, 'src/components/patient/QuickStatsBar.tsx'), 'utf8'));
    expect(src).not.toMatch(/gaWeeks\s*[<>]=?\s*(34|37|41)/);
  });
});

