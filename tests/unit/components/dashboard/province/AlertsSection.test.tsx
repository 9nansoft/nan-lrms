import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, within } from '@testing-library/react';
import { AlertsSection } from '@/components/dashboard/province/AlertsSection';
import { ALERT_DEFINITIONS, alarmTotal } from '@/components/dashboard/province/alert-definitions';
import { ANC_OPS } from '@/config/anc-ops';

const hot = { referralAlerts: 7, overdueAnc: 138, dueSoon: 172 };

describe('alert definitions', () => {
  it('sums only alarm kinds (due-soon is workload)', () => {
    expect(alarmTotal(hot)).toBe(145);
  });
  it('labels quote thresholds from config, not literals', () => {
    const labels = ALERT_DEFINITIONS.map((d) => d.label).join(' | ');
    expect(labels).toContain(`${ANC_OPS.followupWarnDays} วัน`);
    expect(labels).toContain(`≤${ANC_OPS.dueSoonDays} วัน`);
  });
});

describe('AlertsSection', () => {
  it('Thai tiles keep the board deep links and test ids', () => {
    render(<AlertsSection alerts={hot} />);
    expect(screen.getByRole('region', { name: 'งานที่ต้องจัดการ' })).toBeInTheDocument();
    const cases: Array<[string, string, string]> = [
      ['alert-referrals', '7', '/referrals?overdue=1'],
      ['alert-overdue-anc', '138', '/pregnancies?cohort=anc_stale'],
      ['alert-due-soon', '172', '/pregnancies?cohort=due_soon'],
    ];
    for (const [id, value, href] of cases) {
      const tile = screen.getByTestId(id);
      expect(within(tile).getByText(value)).toBeInTheDocument();
      expect(within(tile).getByRole('link')).toHaveAttribute('href', href);
    }
    expect(screen.getByText(/งานเร่งด่วนรวม 145 รายการ/)).toBeInTheDocument();
  });

  it('alarms go solid red, workload goes amber, and English labels are gone', () => {
    render(<AlertsSection alerts={hot} />);
    expect(screen.getByTestId('alert-referrals').className).toContain('bg-danger');
    expect(screen.getByTestId('alert-due-soon').className).toContain('bg-warn-tint');
    expect(screen.queryByText(/REFERRAL ACTION|OVERDUE ANC|ALL CLEAR|ACTIVE ALERTS|DUE ≤14/)).toBeNull();
  });

  it('zero alarms read as no urgent work, with the existing zero texts', () => {
    render(<AlertsSection alerts={{ referralAlerts: 0, overdueAnc: 0, dueSoon: 5 }} />);
    expect(screen.getByText(/^ไม่มีงานเร่งด่วน/)).toBeInTheDocument();
    const referral = screen.getByTestId('alert-referrals');
    expect(referral.className).toContain('bg-ok-tint');
    expect(within(referral).getByText('ไม่มีส่งต่อค้างเกิน SLA')).toBeInTheDocument();
  });

  it('every tile explains itself through a hint button outside its link', () => {
    render(<AlertsSection alerts={hot} />);
    const hint = screen.getByRole('button', { name: 'คำอธิบาย: ส่งต่อที่ต้องเร่งจัดการ' });
    expect(within(screen.getByTestId('alert-referrals')).getByRole('link').contains(hint)).toBe(false);
  });
});

describe('AlertsSection normal-mode copy (I2)', () => {
  it('has no release-note wording and does not overstate the zero state', () => {
    const body = (d: (typeof ALERT_DEFINITIONS)[number]) =>
      renderToStaticMarkup(<>{d.tooltipBodyTh}</>).replace(/<[^>]+>/g, '');
    for (const d of ALERT_DEFINITIONS) {
      expect(body(d)).not.toMatch(/ต่างจากเดิม|IN-TRANSIT|เดิม/);
      expect(d.zeroLabelTh).not.toBe('ANC ครบทุกราย');
    }
    const anc = ALERT_DEFINITIONS.find((d) => d.key === 'overdueAnc')!;
    expect(anc.zeroLabelTh).toBe(`ไม่มีขาดนัดเกิน ${ANC_OPS.followupWarnDays} วัน`);
  });
  it('normal mode renders the Thai fields; kiosk strings are untouched', () => {
    render(<AlertsSection alerts={{ referralAlerts: 0, overdueAnc: 0, dueSoon: 0 }} />);
    expect(screen.getByTestId('alert-overdue-anc')).toHaveTextContent(`ไม่มีขาดนัดเกิน ${ANC_OPS.followupWarnDays} วัน`);
    const anc = ALERT_DEFINITIONS.find((d) => d.key === 'overdueAnc')!;
    expect(anc.zeroLabel).toBe('ANC ครบทุกราย');
    expect(anc.kioskLabel).toBe('OVERDUE ANC');
  });
});
