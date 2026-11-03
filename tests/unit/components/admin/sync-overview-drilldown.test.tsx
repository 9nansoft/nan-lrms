// tests/unit/components/admin/sync-overview-drilldown.test.tsx
// A4: the sync-overview drill-down must edit the REAL registry record. It used
// to hand HospitalEditDialog a stripped hospital (provinceCode/lat/lon null,
// default service type), so saving General overwrote real registry data.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncOverviewTab } from '@/components/admin/SyncOverviewTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const OVERVIEW = {
  total: 1,
  updatedAt: '2026-10-11T03:00:00Z',
  hospitals: [{
    hcode: '10670', name: 'รพ.น่าน', level: 'A_S', isActive: true, connectionStatus: 'CONNECTED', lastSyncAt: null,
    authenticity: { status: null, reason: null, checkedAt: null, isFailure: false }, dataPurgedAt: null, hasBmsConfig: true,
    latestRun: {
      runId: 'r1', hospitalId: 'h1', hcode: '10670', trigger: 'scheduled', startedAt: '2026-10-11T02:59:00Z',
      finishedAt: '2026-10-11T02:59:02Z', durationMs: 2100, outcome: 'failed', finalMessage: null,
      errorMessage: 'tunnel timeout', steps: [],
    },
  }],
};
const REAL = adminHospital({
  serviceType: 'PROVINCIAL_HUB', provinceCode: '40', districtCode: '4001', lat: 16.43, lon: 102.83,
});
const MAP = {
  '/api/admin/sync-overview': OVERVIEW,
  '/api/admin/hospitals': { hospitals: [REAL] },
  '/api/admin/provinces': { provinces: [{ code: '40', name: 'น่าน' }] },
};

describe('SyncOverviewTab drill-down edits the real registry record (A4)', () => {
  it('saving General from the drill-down keeps provinceCode, lat, lon and serviceType', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<SyncOverviewTab />, MAP);
    await userEvent.click(await screen.findByText('tunnel timeout'));
    await userEvent.click(await screen.findByRole('button', { name: /ข้อมูลทั่วไป/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/hospitals/10670');
    expect(JSON.parse(String(init!.body))).toMatchObject({
      provinceCode: '40', lat: 16.43, lon: 102.83, serviceType: 'PROVINCIAL_HUB',
    });
  });

  it('while the registry is still loading, the row click shows progress instead of a stripped dialog', async () => {
    renderWithSwr(<SyncOverviewTab />, { '/api/admin/sync-overview': OVERVIEW });
    await userEvent.click(await screen.findByText('tunnel timeout'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText(/กำลังโหลดข้อมูลโรงพยาบาล/)).toBeInTheDocument();
  });

  it('if the registry cannot be loaded, shows an actionable Thai error and never opens the dialog', async () => {
    renderWithSwr(<SyncOverviewTab />, { '/api/admin/sync-overview': OVERVIEW, '/api/admin/hospitals': new Error('boom') });
    await userEvent.click(await screen.findByText('tunnel timeout'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('โหลดข้อมูลโรงพยาบาลเพื่อแก้ไขไม่สำเร็จ');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
  });
});
