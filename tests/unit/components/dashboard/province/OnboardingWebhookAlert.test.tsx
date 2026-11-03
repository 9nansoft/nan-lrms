import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWebhookAlert } from '@/components/dashboard/province/OnboardingWebhookAlert';

describe('OnboardingWebhookAlert', () => {
  it('says what failed, shows the error, says what to do, and can be hidden', () => {
    const onDismiss = vi.fn();
    render(<OnboardingWebhookAlert error="HTTP 500 from HOSxP" onDismiss={onDismiss} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('ไม่สามารถอัปเดต webhook_setting บน HOSxP');
    expect(alert).toHaveTextContent('HTTP 500 from HOSxP');
    expect(alert).toHaveTextContent('วิธีแก้:');
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
