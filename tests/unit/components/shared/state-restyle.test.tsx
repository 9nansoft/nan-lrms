import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from '@/components/shared/ErrorState';
import { StaleBanner } from '@/components/shared/StaleBanner';
import { LoadingState } from '@/components/shared/LoadingState';

describe('state components use tokens and actionable Thai copy', () => {
  it('ErrorState banner shows what / since / what-to-do', () => {
    render(
      <ErrorState
        variant="banner"
        message="โหลดข้อมูลแดชบอร์ดไม่สำเร็จ"
        lastUpdatedAt="2026-10-11T05:38:00Z"
        remedy="ตรวจสอบอินเทอร์เน็ต แล้วกดลองใหม่"
        onRetry={() => {}}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
    expect(alert).toHaveTextContent('วิธีแก้: ตรวจสอบอินเทอร์เน็ต แล้วกดลองใหม่');
    expect(alert.className).toContain('bg-warn-tint');
    expect(alert.className).not.toMatch(/text-\[\d+px\]/);
  });
  it('ErrorState page variant uses the danger text token', () => {
    render(<ErrorState message="ผิดพลาด" />);
    expect(screen.getByText('ผิดพลาด').className).toContain('text-danger-text');
  });
  it('StaleBanner partial outage is a warn strip that names hospitals and the fix', () => {
    render(<StaleBanner allOffline={false} offlineHospitals={['บ้านไผ่']} />);
    const el = screen.getByRole('alert');
    expect(el.className).toContain('bg-warn-tint');
    expect(el).toHaveTextContent('บ้านไผ่');
    expect(el).toHaveTextContent('วิธีแก้');
  });
  it('StaleBanner full outage is a danger strip', () => {
    render(<StaleBanner allOffline offlineHospitals={[]} />);
    expect(screen.getByRole('alert').className).toContain('bg-danger');
  });
  it('LoadingState uses body text', () => {
    render(<LoadingState />);
    expect(screen.getByText('กำลังโหลดข้อมูล...').className).toContain('text-body');
  });
});
