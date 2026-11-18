// tests/unit/components/admin/node-hospital-tab.test.tsx
// The "รพ.โหนด" tab: the admin links a node hospital to a hospital it
// supervises, and unlinks it again.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeHospitalTab } from '@/components/admin/NodeHospitalTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HOSPITALS = {
  '/api/admin/hospitals': {
    hospitals: [
      adminHospital({ hcode: '10670', name: 'รพ.น่าน' }),
      adminHospital({ hcode: '11004', name: 'รพ.พล' }),
    ],
  },
  '/api/admin/hospital-nodes': {
    nodePairs: [
      {
        id: 'p1',
        nodeHcode: '10670',
        nodeName: 'รพ.น่าน',
        childHcode: '11004',
        childName: 'รพ.พล',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
  },
};

describe('NodeHospitalTab', () => {
  it('lists the node pairs', async () => {
    renderWithSwr(<NodeHospitalTab />, HOSPITALS);
    expect(await screen.findByText('รพ.พล')).toBeInTheDocument();
    expect(await screen.findByText('11004')).toBeInTheDocument();
  });

  it('POSTs the pair when both hospitals are picked', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<NodeHospitalTab />, HOSPITALS);
    await userEvent.selectOptions(await screen.findByLabelText('รพ.โหนด'), '10670');
    await userEvent.selectOptions(screen.getByLabelText('รพ.ที่อยู่ในกำกับ'), '11004');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มความสัมพันธ์/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospital-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeHcode: '10670', childHcode: '11004' }),
      }),
    );
  });

  it('refuses to link a hospital to itself', async () => {
    stubMutations();
    renderWithSwr(<NodeHospitalTab />, HOSPITALS);
    await userEvent.selectOptions(await screen.findByLabelText('รพ.โหนด'), '10670');
    await userEvent.selectOptions(screen.getByLabelText('รพ.ที่อยู่ในกำกับ'), '10670');
    expect(
      await screen.findByText(/ต้องไม่ใช่โรงพยาบาลเดียวกัน/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /เพิ่มความสัมพันธ์/ })).toBeDisabled();
  });

  it('DELETEs the pair', async () => {
    const fetchSpy = stubMutations();
    vi.stubGlobal('confirm', () => true);
    renderWithSwr(<NodeHospitalTab />, HOSPITALS);
    await userEvent.click(await screen.findByRole('button', { name: /ลบความสัมพันธ์/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospital-nodes/p1', { method: 'DELETE' }),
    );
  });
});
