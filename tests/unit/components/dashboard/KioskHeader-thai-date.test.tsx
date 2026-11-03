// Letter-spacing breaks Thai shaping (vowel/tone marks detach), so the Thai
// date in the kiosk header must render with normal tracking.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KioskHeader } from '@/components/dashboard/KioskHeader';

describe('KioskHeader Thai date', () => {
  it('is not letter-spaced', async () => {
    const { container } = render(<KioskHeader updatedAt={null} onExit={() => undefined} />);
    // The date is set in a microtask after mount.
    await screen.findByText(/พ\.ศ\.|25\d\d/);
    const dateEl = Array.from(container.querySelectorAll('div')).find((d) =>
      /พ\.ศ\.|25\d\d/.test(d.textContent ?? '') && d.children.length === 0,
    ) as HTMLElement;
    expect(dateEl).toBeTruthy();
    expect(dateEl.className).not.toMatch(/tracking-\[/);
    expect(dateEl.className).toMatch(/tracking-normal/);
  });
});
