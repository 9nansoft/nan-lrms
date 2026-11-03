// tests/unit/pages/hospital-console.test.tsx
// Hospital console — characterization (written before the UI sub-project 4
// re-chrome) + redesign assertions. KPIs must come from server aggregates
// (pagination.total / counts / incoming count), rows must navigate, and a
// failing feed must show its banner without hiding the other registry.
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { SWRConfig } from 'swr';
import { HOSPITAL_CONSOLE } from '@/config/hospital-network';
import HospitalConsolePage from '@/app/(provincial)/hospitals/[hcode]/page';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ hcode: '10670' }),
  usePathname: () => '/hospitals/10670',
}));

const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

function labor() {
  return {
    hospital: { name: 'รพ.น่าน', level: 'A_S', connectionStatus: 'ONLINE', lastSyncAt: ago(5 * 60_000) },
    patients: [
      {
        id: 'p1', hn: 'HN1', an: 'AN1', name: 'นาง สายฝน อุ่นเรือน', age: 28, gravida: 2, ga_weeks: 39, anc_count: 8,
        admit_date: ago(5 * H), labor_status: 'ACTIVE', cpd_score: 11, cpd_risk_level: 'HIGH',
        latest_vitals: { maternal_hr: 90, fetal_hr: '150', sbp: 165, dbp: 100 }, latest_cervix_cm: 9, partograph_alert_count: 1,
      },
      {
        id: 'p2', hn: 'HN2', an: 'AN2', name: 'นาง มะลิ ทองคำ', age: 31, gravida: 1, ga_weeks: 38, anc_count: 6,
        admit_date: ago(2 * H), labor_status: 'ACTIVE', cpd_score: 3, cpd_risk_level: 'LOW',
        latest_vitals: null, latest_cervix_cm: 4, partograph_alert_count: 1,
      },
    ],
    pagination: { total: 42 },
    partographAudit: null,
  };
}

function anc() {
  const base = { careStage: 'PREGNANCY', lmp: null, registeredAt: ago(100 * D), hospitalName: 'รพ.น่าน', hcode: '10670' };
  return {
    journeys: [
      { ...base, id: 'j1', hn: 'HN11', name: 'นาง จันทร์ ดีใจ', age: 25, gravida: 1, para: 0, gaWeeks: 39, edc: ahead(3 * D), ancRiskLevel: 'HR3', ancVisitCount: 7, lastAncDate: ago(20 * D) },
      { ...base, id: 'j2', hn: 'HN12', name: 'นาง ดาว สว่าง', age: 30, gravida: 2, para: 1, gaWeeks: 20, edc: ahead(140 * D), ancRiskLevel: 'LOW', ancVisitCount: 3, lastAncDate: ago(2 * D) },
    ],
    pagination: { total: 435, page: 1, perPage: 1000, totalPages: 1 },
    counts: { low: 300, hr1: 60, hr2: 40, hr3: 35, total: 435 },
  };
}

function incoming() {
  return { hubHcode: '10670', minGaWeeks: 34, count: 7, byTrigger: { ga: 5, fw: 1, risk: 1 }, items: [] };
}

async function renderConsole(opts: { laborFails?: boolean } = {}) {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/patients?')) {
      if (opts.laborFails) throw new Error('labor feed down');
      return labor();
    }
    if (url.includes('/journeys?stage=PREGNANCY')) return anc();
    if (url.includes('/incoming-pregnancies')) return incoming();
    if (url.startsWith('/api/journeys/')) return { journey: null };
    throw new Error(`unexpected fetch ${url}`);
  });
  await act(async () => {
    render(
      <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <Suspense fallback={null}>
          <HospitalConsolePage params={Promise.resolve({ hcode: '10670' })} />
        </Suspense>
      </SWRConfig>,
    );
  });
  return { fetcher };
}

describe('HospitalConsolePage — characterization', () => {
  it('titles the page with the hospital name', async () => {
    await renderConsole();
    expect(await screen.findByRole('heading', { level: 1, name: 'รพ.น่าน' })).toBeInTheDocument();
  });

  it('ward census, registry size and refer-in come from server aggregates, not the 2 fetched rows', async () => {
    await renderConsole();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText('42').length).toBeGreaterThan(0); // pagination.total, not 2
    expect(screen.getAllByText('435').length).toBeGreaterThan(0); // pagination.total, not 2
    expect(screen.getAllByText('35').length).toBeGreaterThan(0); // counts.hr3
    expect(screen.getAllByText('7').length).toBeGreaterThan(0); // incoming count
  });

  it('a labour row opens the patient page', async () => {
    nav.push.mockClear();
    await renderConsole();
    fireEvent.click((await screen.findAllByRole('button', { name: /นาง มะลิ/ }))[0]);
    expect(nav.push).toHaveBeenCalledWith('/patients/10670-AN2');
  });

  it('focusing a row scrolls a stacked preview into view (hover selects without scrolling)', async () => {
    // jsdom lays everything out at 0,0 — the preview is "not beside" the list, i.e. stacked.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      await renderConsole();
      const row = (await screen.findAllByRole('button', { name: /นาง มะลิ/ }))[0];
      fireEvent.mouseEnter(row);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.focus(row);
      expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('the ANC tab lists pregnancies and a row opens the journey', async () => {
    nav.push.mockClear();
    await renderConsole();
    fireEvent.click(await screen.findByRole('button', { name: /ANC REGISTRY|ทะเบียนฝากครรภ์/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: /นาง ดาว/ }))[0]);
    expect(nav.push).toHaveBeenCalledWith('/pregnancies/j2');
  });

  it('a failing labour feed shows its banner and keeps the ANC registry', async () => {
    await renderConsole({ laborFails: true });
    expect(await screen.findByText(/โหลดข้อมูลห้องคลอดไม่สำเร็จ/)).toBeInTheDocument();
    expect(screen.getAllByText('435').length).toBeGreaterThan(0);
  });
});



describe('HospitalConsolePage — sub-project 4 chrome', () => {
  it('KPI tiles in Thai with server-aggregate values', async () => {
    await renderConsole();
    // The value node also carries the unit ("42ราย"); the figure is its leading digits.
    const v = async (id: string) =>
      (await screen.findByTestId(id)).querySelector('[data-kpi-value]')!.textContent!.match(/^[\d,]+/)![0];
    expect(await v('kpi-labor-total')).toBe('42');
    expect(await v('kpi-labor-alarms')).toBe('1'); // p1 BP 165/100
    expect(await v('kpi-labor-second-stage')).toBe('1'); // p1 cervix 9 cm, active
    expect(await v('kpi-anc-total')).toBe('435');
    expect(await v('kpi-anc-hr3')).toBe('35');
    expect(await v('kpi-anc-overdue')).toBe('1'); // j1 last ANC 20 days ago
    expect(await v('kpi-anc-due-week')).toBe('1'); // j1 EDC in 3 days
    expect(await v('kpi-refer-in')).toBe('7');
    expect(screen.getByTestId('kpi-anc-overdue')).toHaveTextContent(`ห่างนัด ANC ≥ ${HOSPITAL_CONSOLE.ancOverdueAfterDays} วัน`);
    expect(screen.getByTestId('kpi-refer-in')).toHaveTextContent(`GA ≥ ${HOSPITAL_CONSOLE.referInMinGaWeeks} สัปดาห์`);
  });

  it('Thai header, back link, tabs and group labels; no English chrome and no zoom', async () => {
    await renderConsole();
    await screen.findByRole('heading', { level: 1, name: 'รพ.น่าน' });
    expect(screen.getByRole('link', { name: /รายชื่อโรงพยาบาล/ })).toHaveAttribute('href', '/hospitals');
    expect(screen.getByRole('button', { name: /ห้องคลอด/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/ผู้คลอดทั้งหมด · เรียงตามคะแนน CPD/)).toBeInTheDocument();
    for (const en of ['MISSION CONSOLE', 'PROVINCIAL REGISTRY', 'ON FLOOR', '2ND STAGE', 'LABOR WARD', 'ANC REGISTRY', 'ALL PATIENTS', 'SELECT A PATIENT', 'REFER-IN', '3RD TRIMESTER']) {
      expect(screen.queryByText(new RegExp(en))).toBeNull();
    }
    expect(document.querySelector('[style*="zoom"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ทะเบียนฝากครรภ์/ }));
    expect(await screen.findByText(/ไตรมาสที่ 3/)).toBeInTheDocument();
  });

  it('the refer-in pipeline is a section card', async () => {
    await renderConsole();
    expect(await screen.findByRole('region', { name: /ผู้คลอดที่จะส่งต่อมา/ })).toBeInTheDocument();
  });
});

describe('HospitalConsolePage — nurse-facing labels are Thai', () => {
  // Clinical abbreviations nurses use (BP, FHR, CPD, ANC, GA, AN, HN) stay; plain English words go.
  const BANNED = [
    'NO PARTO', 'CERVIX', 'PARTOGRAPH QUALITY', 'STAGE / PROGRESS', 'severe-PE', 'borderline',
    'tachy', 'brady', 'ADMIT', 'VISITS', 'LAST ANC', 'on track', 'LAB SNAPSHOT', 'RISK RULES', 'TIMELINE',
    '\\d+h admit',
  ];

  async function openFirstLabourPreview() {
    await renderConsole();
    await screen.findByRole('heading', { level: 1, name: 'รพ.น่าน' });
    fireEvent.mouseEnter((await screen.findAllByRole('button', { name: /นาง สายฝน/ }))[0]);
  }

  it('labour roster, concern chips and preview use Thai labels', async () => {
    await openFirstLabourPreview();
    const text = document.body.textContent ?? '';
    for (const en of BANNED) expect(text).not.toMatch(new RegExp(en));
    expect(text).toContain('ปากมดลูก');
    expect(text).toContain('ระยะ / ความก้าวหน้า');
    expect(text).toContain('BP'); // clinical abbreviation kept next to Thai
    expect(text).toContain('FHR');
    expect(text).toContain('CPD');
  });

  it('the ANC registry rows use Thai column labels', async () => {
    await renderConsole();
    fireEvent.click(await screen.findByRole('button', { name: /ทะเบียนฝากครรภ์/ }));
    await screen.findAllByRole('button', { name: /นาง ดาว/ });
    const text = document.body.textContent ?? '';
    for (const en of BANNED) expect(text).not.toMatch(new RegExp(en));
  });
});
