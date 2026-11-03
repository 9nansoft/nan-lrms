import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighRiskSection } from '@/components/dashboard/province/HighRiskSection';
import { makeHighRiskPatient } from '../../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('HighRiskSection', () => {
  it('titles the list in Thai and quotes the server total, not the row count', () => {
    render(
      <HighRiskSection patients={[makeHighRiskPatient()]} isLoading={false} totalActive={1234} totalHigh={9} ancFallback={null} />,
    );
    expect(screen.getByRole('region', { name: 'ผู้คลอดเสี่ยงสูงและในห้องคลอด' })).toBeInTheDocument();
    expect(screen.getByText(/ในห้องคลอดทั้งจังหวัด 1,234 ราย/)).toBeInTheDocument();
    expect(screen.getByText(/เฉพาะเสี่ยงสูง/)).toHaveTextContent('9');
    expect(screen.queryByText(/High-risk & Active labor/)).toBeNull();
  });
});
