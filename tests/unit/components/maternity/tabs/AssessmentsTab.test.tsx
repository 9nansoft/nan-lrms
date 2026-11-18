/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Assessments tab — the [LR] forms of the patient whose drawer is open, read
// live from HOSxP through the browser's BMS session.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({ getPatientAssessments: vi.fn() }));

import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientAssessments } from '@/services/maternity-ward';
import { AssessmentsTab } from '@/components/maternity/tabs/AssessmentsTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientAssessments as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockGet.mockReset();
  mockBmsSession.mockReturnValue({ config: cfg, userInfo: { hospcode: '10716' } });
});

describe('AssessmentsTab', () => {
  it('renders the labelled fields of the form', async () => {
    mockGet.mockResolvedValue([
      {
        id: 'asm_lr_record_after_birth_nan:2418',
        formKey: 'after_birth',
        formTable: 'asm_lr_record_after_birth_nan',
        formName: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
        recordedAt: '2026-11-17T21:03:15.000Z',
        recordedDate: '2026-11-17',
        entryStaff: 'jcome',
        fields: [
          {
            column: 'asm_text2',
            label: 'Systolic',
            component: 'TextEdit',
            dataType: 'VARCHAR(250)',
            value: '138',
            encrypted: false,
          },
        ],
      },
    ]);

    render(<AssessmentsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Systolic')).toBeTruthy());
    expect(screen.getByText('138')).toBeTruthy();
    expect(screen.getByText('หลังคลอด')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith(cfg, 'AN1');
  });

  it('says so when the hospital recorded no form', async () => {
    mockGet.mockResolvedValue([]);
    render(<AssessmentsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('ยังไม่มีแบบฟอร์มประเมินที่บันทึกไว้ใน HOSxP')).toBeTruthy());
  });

  it('shows the error and offers a retry when the read fails', async () => {
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<AssessmentsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ/)).toBeTruthy());
    expect(screen.getByText('ลองอีกครั้ง')).toBeTruthy();
  });

  it('does not query without a BMS session', async () => {
    mockBmsSession.mockReturnValue({ config: null, userInfo: null });
    render(<AssessmentsTab an="AN1" />, { wrapper });
    expect(screen.getByText('ไม่พร้อมใช้งาน (ไม่มี BMS session)')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
