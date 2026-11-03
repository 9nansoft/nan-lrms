import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HospitalDetailDialog } from '@/components/dashboard/HospitalDetailDialog';
import { makeHighRiskPatient } from '../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('HospitalDetailDialog patient list (M3)', () => {
  it('Thai h3 heading above the list, no English SectionLabel, counts from server totals', () => {
    const p = makeHighRiskPatient({ hcode: '10670' });
    render(
      <HospitalDetailDialog
        hcode="10670"
        hospital={
          {
            hcode: '10670',
            name: 'รพ.ทดสอบ',
            level: 'M1',
            connectionStatus: 'ONLINE',
            counts: { low: 1, medium: 2, high: 40, total: 99 },
          } as never
        }
        allHighRiskPatients={[p]}
        open
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: /ผู้คลอดเสี่ยงสูงและในห้องคลอด/ })).toBeInTheDocument();
    expect(screen.queryByText(/High-risk & Active labor/)).toBeNull();
    // tab badges use the server totals (99 / 40), not the 1-row fetch
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });
});
