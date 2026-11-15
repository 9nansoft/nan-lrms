/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { JourneyLabResult } from '@/services/anc-lab-results';

type HookResult = {
  results: JourneyLabResult[] | null;
  tier: 'full' | 'own_results' | null;
  error: Error | undefined;
  isForbidden: boolean;
  isLoading: boolean;
  mutate: () => void;
};
let hook: HookResult;
vi.mock('@/hooks/useJourneyLabs', () => ({ useJourneyLabs: () => hook }));

import { JourneyLabPanel } from '@/components/patient/JourneyLabPanel';
import { ANC_LAB_EARLIER_POSITIVE_NOTE, ANC_LAB_GREY_LEGEND } from '@/config/anc-lab-display';
import { formatBangkokDate } from '@/lib/bangkok-time';

let seq = 0;
function lab(over: Partial<JourneyLabResult> = {}): JourneyLabResult {
  seq += 1;
  return {
    id: `r${seq}`,
    hospitalId: 'h1',
    hospitalName: 'รพ.หนึ่ง',
    hcode: '11001',
    source: 'lab_order',
    resultDate: '2026-03-01',
    gaWeeks: 12,
    canonicalTest: 'HCT',
    classificationNote: null,
    ancLabName: null,
    labItemsName: 'Hct',
    labItemsCode: '1',
    rawResult: '33',
    rawResultUnreadable: false,
    numericValue: 33,
    normalizedValue: null,
    interpretation: null,
    unit: '%',
    normalReference: '35-45',
    abnormalFlag: null,
    ancResultNormalRaw: null,
    concealed: false,
    contextUnreadable: false,
    syncedAt: '2026-03-02T05:00:00.000Z',
    ...over,
  };
}

function show(results: JourneyLabResult[] | null, over: Partial<HookResult> = {}) {
  hook = {
    results,
    tier: results ? 'full' : null,
    error: undefined,
    isForbidden: false,
    isLoading: false,
    mutate: () => {},
    ...over,
  };
  return render(<JourneyLabPanel journeyId="j-1" />);
}
const tile = (label: string) => screen.getByTestId(`lab-tile-${label}`);

describe('JourneyLabPanel', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('shows a loading state', () => {
    show(null, { isLoading: true });
    expect(screen.getByText('กำลังโหลดผลตรวจ...')).toBeTruthy();
  });

  it('says what went wrong and what to do when loading fails', () => {
    show(null, { error: new Error('x') });
    expect(screen.getByText(/โหลดผลตรวจไม่สำเร็จ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeTruthy();
  });

  it('explains a permission denial, says who to contact and offers no retry', () => {
    show(null, { error: new Error('x'), isForbidden: true });
    expect(screen.getByText(/ไม่มีสิทธิ์ดูผลตรวจ/)).toBeTruthy();
    expect(screen.getByText(/ติดต่อโรงพยาบาลที่ผู้ป่วยฝากครรภ์/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ลองใหม่/ })).toBeNull();
  });

  describe('own results only', () => {
    const notice = /แสดงเฉพาะผลตรวจของโรงพยาบาลนี้/;
    const viaReferral = /โรงพยาบาลอื่น.*การส่งต่อ/;

    it('says the list is partial and how to see the rest', () => {
      show([lab()], { tier: 'own_results' });
      expect(screen.getByText(notice).textContent).toMatch(viaReferral);
    });

    it('never reads as no results existing when this hospital has none', () => {
      show([], { tier: 'own_results' });
      expect(screen.getByText(notice)).toBeTruthy();
      expect(screen.queryByText('ยังไม่มีผลตรวจในระบบ')).toBeNull();
      expect(screen.getByText('โรงพยาบาลนี้ยังไม่มีผลตรวจของผู้ป่วยรายนี้')).toBeTruthy();
    });

    it('hides the missing-tests list, which cannot be known from partial data', () => {
      show([lab()], { tier: 'own_results' });
      expect(screen.queryByTestId('lab-missing-list')).toBeNull();
    });

    it('shows no notice with full access', () => {
      show([lab()]);
      expect(screen.queryByText(notice)).toBeNull();
    });
  });

  it('shows an empty state with the core list', () => {
    show([]);
    expect(screen.getByText(/ยังไม่มีผลตรวจในระบบ/)).toBeTruthy();
    expect(screen.getByTestId('lab-missing-list').textContent).toContain('HBsAg');
  });

  it('shows value, unit, date, GA, hospital, source and HOSxP reference', () => {
    show([lab()]);
    const t = tile('Hct');
    expect(t.textContent).toContain('33');
    expect(t.textContent).toContain('%');
    expect(t.textContent).toContain('1 มี.ค. 2569');
    expect(t.textContent).toContain('GA 12');
    expect(t.textContent).toContain('รพ.หนึ่ง');
    expect(t.textContent).toContain('ห้องแล็บ');
    expect(t.textContent).toContain('35-45');
  });

  it('shows a concealed result without any value', () => {
    show([
      lab({
        canonicalTest: 'HIV',
        concealed: true,
        rawResult: null,
        numericValue: null,
        interpretation: 'concealed',
      }),
    ]);
    const t = tile('Anti-HIV');
    expect(t.textContent).toContain('ปกปิดผล');
    expect(t.dataset.status).toBe('concealed');
  });

  it('shows an unreadable result explicitly', () => {
    show([lab({ rawResultUnreadable: true, rawResult: null, numericValue: null })]);
    expect(tile('Hct').textContent).toContain('อ่านข้อมูลไม่ได้');
    expect(tile('Hct').dataset.status).toBe('unreadable');
  });

  it('marks a HOSxP-flagged result abnormal but leaves an unflagged low number uncoloured', () => {
    show([
      lab({ abnormalFlag: 'Y', numericValue: 30, rawResult: '30' }),
      lab({ canonicalTest: 'HB', labItemsName: 'Hb', numericValue: 6, rawResult: '6' }),
    ]);
    expect(tile('Hct').dataset.status).toBe('abnormal');
    expect(tile('Hb').dataset.status).toBe('neutral');
  });

  it('lists unclassified results by original name with no colour', () => {
    show([
      lab({
        canonicalTest: null,
        labItemsName: 'Ferritin',
        rawResult: '30',
        numericValue: null,
        interpretation: 'unknown',
        abnormalFlag: 'Y',
      }),
    ]);
    const section = screen.getByTestId('lab-other');
    expect(within(section).getByText('Ferritin')).toBeTruthy();
    expect(tile('Ferritin').dataset.status).toBe('neutral');
    expect(tile('Ferritin').textContent).toContain('HOSxP ระบุว่าผิดปกติ');
  });

  it('draws a trend for repeated Hct and keeps older results visible', () => {
    show([
      lab({ resultDate: '2026-05-01', numericValue: 30, rawResult: '30' }),
      lab({ resultDate: '2026-03-01', numericValue: 34, rawResult: '34' }),
    ]);
    expect(screen.getByRole('img', { name: /Hct/ })).toBeTruthy();
    expect(tile('Hct').textContent).toContain('34');
  });

  it('labels missing core tests neutrally, without overdue wording', () => {
    show([lab()]);
    const list = screen.getByTestId('lab-missing-list');
    expect(list.textContent).toContain('ยังไม่มีผลในระบบ');
    expect(list.textContent).toContain('Anti-HIV');
    expect(list.textContent).not.toMatch(/เกินกำหนด|overdue|ค้าง/i);
  });

  it('states the data source and last sync, per hospital', () => {
    show([lab()]);
    const line = screen.getByTestId('lab-provenance').textContent ?? '';
    expect(line).toContain('HOSxP');
    expect(line).toContain('รพ.หนึ่ง');
    expect(line).toContain('2 มี.ค. 2569 12:00');
  });

  it('never puts a result in a tooltip', () => {
    const { container } = show([
      lab({
        canonicalTest: 'HIV',
        rawResult: 'Positive',
        numericValue: null,
        interpretation: 'positive',
      }),
    ]);
    expect(container.querySelector('[title]')).toBeNull();
    expect(tile('Anti-HIV').textContent).toContain('Positive');
  });
});

describe('JourneyLabPanel — grey legend', () => {
  it('says grey was not interpreted, to read the text, and is not a normal result', () => {
    hook = {
      results: [lab()],
      tier: 'full',
      error: undefined,
      isForbidden: false,
      isLoading: false,
      mutate: () => {},
    };
    render(<JourneyLabPanel journeyId="j1" />);
    expect(screen.getByText(ANC_LAB_GREY_LEGEND)).toBeTruthy();
    expect(ANC_LAB_GREY_LEGEND).toContain('แปลผล');
    expect(ANC_LAB_GREY_LEGEND).toContain('ไม่ได้หมายความว่าผลปกติ');
  });
});

describe('JourneyLabPanel — a positive earlier in this pregnancy', () => {
  it('shows the latest value, is not green, and names the date of the positive', () => {
    const hiv = {
      canonicalTest: 'HIV' as const,
      labItemsName: 'Anti HIV',
      unit: null,
      numericValue: null,
    };
    hook = {
      results: [
        lab({
          ...hiv,
          rawResult: 'Negative',
          interpretation: 'negative',
          resultDate: '2026-05-01',
        }),
        lab({
          ...hiv,
          rawResult: 'Positive',
          interpretation: 'positive',
          resultDate: '2026-02-01',
        }),
      ],
      tier: 'full',
      error: undefined,
      isForbidden: false,
      isLoading: false,
      mutate: () => {},
    };
    render(<JourneyLabPanel journeyId="j1" />);
    const tile = screen.getByTestId('lab-tile-Anti-HIV');
    expect(tile.getAttribute('data-status')).not.toBe('normal');
    expect(within(tile).getByText('Negative')).toBeTruthy();
    const note = within(tile).getByTestId('lab-earlier-positive');
    expect(note.textContent).toContain(ANC_LAB_EARLIER_POSITIVE_NOTE);
    expect(note.textContent).toContain(formatBangkokDate(new Date('2026-02-01')));
  });
});
