// tests/unit/components/patient/detail.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cdssTabBadge } from '@/components/patient/detail/PartographWorkspace';
import { AncSummaryCard } from '@/components/patient/detail/AncSummaryCard';
import { NewbornOutcomesCard } from '@/components/patient/detail/NewbornOutcomesCard';
import type { CdssAlertDto } from '@/types/api';

const alert = (severity: CdssAlertDto['severity']): CdssAlertDto => ({ severity, section: 'FHR', message: 'm', obsIndex: 0 });

describe('cdssTabBadge — the most severe CDSS level present (countBySeverity unchanged)', () => {
  it.each([
    [[], null],
    [[alert('INFO')], null],
    [[alert('WARN')], { label: 'ระวัง 1', tone: 'brand' }],
    [[alert('WARN'), alert('ALERT'), alert('ALERT')], { label: 'เตือน 2', tone: 'warn' }],
    [[alert('ALERT'), alert('CRITICAL')], { label: 'วิกฤต 1', tone: 'danger' }],
  ] as const)('%j → %j', (alerts, badge) => {
    expect(cdssTabBadge([...alerts])).toEqual(badge);
  });
});

describe('AncSummaryCard', () => {
  const journey = {
    journeyId: 'j-1',
    careStage: 'LABOR',
    ancRiskLevel: 'HR3',
    ancVisitCount: 3,
    lastAncDate: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    lmp: null,
    edc: null,
    referrals: [],
    newborns: [],
  };
  it('risk via AncRiskChip, Thai care stage, visit band and stale last visit from config', () => {
    render(<AncSummaryCard journey={journey} now={Date.now()} />);
    expect(document.querySelector('[data-risk="HR3"]')).not.toBeNull();
    expect(screen.getByText('ความเสี่ยงสูง')).toBeInTheDocument();
    expect(screen.getByText('ระยะการดูแล: ระหว่างคลอด')).toBeInTheDocument();
    expect(screen.getByText('ต่ำกว่ามาตรฐาน')).toBeInTheDocument(); // 3 < 4
    expect(screen.getByText('/ 8')).toBeInTheDocument();
    expect(screen.getByText('40 วันที่แล้ว').parentElement!.className).toContain('border-l-danger'); // > 28 days
    expect(screen.getByRole('link', { name: 'ดูรายละเอียดการฝากครรภ์ →' })).toHaveAttribute('href', '/pregnancies/j-1');
  });
});

describe('NewbornOutcomesCard', () => {
  it('flags LBW and low Apgar with the newborn thresholds', () => {
    render(
      <NewbornOutcomesCard
        newborns={[{ infantNumber: 1, sex: 'F', birthWeightG: 2300, apgar1min: 7, apgar5min: 6, bornAt: new Date().toISOString() }]}
      />,
    );
    expect(screen.getByText('LBW')).toBeInTheDocument();
    expect(screen.getByTestId('newborn-apgar-1')).toHaveAttribute('data-low', 'true');
    expect(screen.getByText('เพศหญิง')).toBeInTheDocument();
  });
});

