// StaleBanner component tests
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaleBanner } from '@/components/shared/StaleBanner';

describe('StaleBanner', () => {
  it('renders red banner with offline message when allOffline is true', () => {
    const { container } = render(
      <StaleBanner allOffline={true} />,
    );
    expect(
      screen.getByText('ระบบไม่สามารถเชื่อมต่อ HOSxP ได้ — ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน'),
    ).toBeTruthy();
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.className).toContain('bg-danger');
  });

  it('renders yellow banner with hospital names when specific hospitals are offline', () => {
    const { container } = render(
      <StaleBanner allOffline={false} offlineHospitals={['รพ.สต.บ้านนา', 'รพ.สต.ท่าม่วง']} />,
    );
    expect(
      screen.getByText('โรงพยาบาลออฟไลน์: รพ.สต.บ้านนา, รพ.สต.ท่าม่วง'),
    ).toBeTruthy();
    const banner = container.firstElementChild as HTMLElement;
    expect(banner.className).toContain('bg-warn-tint');
  });

  it('returns null when no hospitals are offline', () => {
    const { container } = render(
      <StaleBanner allOffline={false} offlineHospitals={[]} />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  it('returns null when allOffline is false and offlineHospitals is not provided', () => {
    const { container } = render(
      <StaleBanner allOffline={false} />,
    );
    expect(container.firstElementChild).toBeNull();
  });
});
