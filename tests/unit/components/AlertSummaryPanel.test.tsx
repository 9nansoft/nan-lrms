// AlertSummaryPanel — TDD tests
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertSummaryPanel } from '@/components/patient/AlertSummaryPanel';
import type { CdssAlertDto, PartographObservationDto } from '@/types/api';

function makeObservation(
  overrides: Partial<PartographObservationDto> = {},
): PartographObservationDto {
  return {
    id: 'obs-1',
    observeDatetime: '2026-04-19T08:30:00Z',
    hourNo: 0,
    fetalHeartRate: null,
    amnioticFluid: null,
    amnioticTypeName: null,
    moulding: null,
    cervicalDilationCm: null,
    descentOfHead: null,
    contractionPer10Min: null,
    contractionDurationSec: null,
    contractionStrength: null,
    oxytocinUml: null,
    oxytocinDropsMin: null,
    drugsIvFluids: null,
    pulse: null,
    bpSystolic: null,
    bpDiastolic: null,
    temperature: null,
    urineVolumeMl: null,
    urineProtein: null,
    urineGlucose: null,
    urineAcetone: null,
    note: null,
    entryStaff: null,
    ...overrides,
  };
}

describe('AlertSummaryPanel', () => {
  it('renders nothing when alerts is empty', () => {
    const { container } = render(
      <AlertSummaryPanel alerts={[]} observations={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('groups alerts by severity in CRITICAL → ALERT → WARN → INFO order', () => {
    const observations: PartographObservationDto[] = [
      makeObservation({ id: 'o0', observeDatetime: '2026-04-19T08:00:00Z' }),
      makeObservation({ id: 'o1', observeDatetime: '2026-04-19T09:00:00Z' }),
      makeObservation({ id: 'o2', observeDatetime: '2026-04-19T10:00:00Z' }),
    ];
    const alerts: CdssAlertDto[] = [
      { severity: 'INFO', section: 'TIME', message: 'info msg', obsIndex: 0 },
      { severity: 'CRITICAL', section: 'FHR', message: 'fhr too low', obsIndex: 1 },
      { severity: 'CRITICAL', section: 'FHR', message: 'fhr too high', obsIndex: 2 },
      { severity: 'ALERT', section: 'CERVIX', message: 'crossed alert line', obsIndex: 1 },
      { severity: 'ALERT', section: 'CERVIX', message: 'crossed action line', obsIndex: 2 },
      { severity: 'ALERT', section: 'CERVIX', message: 'arrest of dilation', obsIndex: 0 },
      { severity: 'WARN', section: 'CONTRACTIONS', message: 'few contractions', obsIndex: 0 },
    ];

    const { container } = render(
      <AlertSummaryPanel alerts={alerts} observations={observations} />,
    );

    const groupNodes = container.querySelectorAll('[data-testid^="alert-group-"]');
    // 4 severities present except INFO has 1 too — so all 4 groups appear
    expect(groupNodes.length).toBe(4);
    // Order check
    expect(groupNodes[0].getAttribute('data-testid')).toBe('alert-group-critical');
    expect(groupNodes[1].getAttribute('data-testid')).toBe('alert-group-alert');
    expect(groupNodes[2].getAttribute('data-testid')).toBe('alert-group-warn');
    expect(groupNodes[3].getAttribute('data-testid')).toBe('alert-group-info');

    // Header text with Thai counts
    expect(screen.getByText(/วิกฤต 2 ครั้ง/)).toBeTruthy();
    expect(screen.getByText(/เตือน 3 ครั้ง/)).toBeTruthy();
    expect(screen.getByText(/ระวัง 1 ครั้ง/)).toBeTruthy();
    expect(screen.getByText(/ข้อมูล 1 ครั้ง/)).toBeTruthy();
  });

  it('omits severity groups with zero alerts', () => {
    const observations: PartographObservationDto[] = [
      makeObservation({ observeDatetime: '2026-04-19T08:00:00Z' }),
    ];
    const alerts: CdssAlertDto[] = [
      { severity: 'CRITICAL', section: 'FHR', message: 'fhr critical', obsIndex: 0 },
    ];

    const { container } = render(
      <AlertSummaryPanel alerts={alerts} observations={observations} />,
    );
    const groupNodes = container.querySelectorAll('[data-testid^="alert-group-"]');
    expect(groupNodes.length).toBe(1);
    expect(groupNodes[0].getAttribute('data-testid')).toBe('alert-group-critical');
    expect(screen.queryByText(/เตือน/)).toBeNull();
    expect(screen.queryByText(/ระวัง/)).toBeNull();
    expect(screen.queryByText(/ข้อมูล/)).toBeNull();
  });

  it('renders message + Thai section label + observation timestamp per row', () => {
    const observations: PartographObservationDto[] = [
      makeObservation({ id: 'o0', observeDatetime: '2026-04-19T01:30:00Z' }),
    ];
    const alerts: CdssAlertDto[] = [
      { severity: 'ALERT', section: 'CERVIX', message: 'crossed alert line', obsIndex: 0 },
    ];

    render(<AlertSummaryPanel alerts={alerts} observations={observations} />);

    expect(screen.getByText(/crossed alert line/)).toBeTruthy();
    // Section label Thai
    expect(screen.getByText(/ปากมดลูก/)).toBeTruthy();
    // Time formatted as HH:MM in th-TH locale; we just assert digits + colon present
    const timeText = new Date(observations[0].observeDatetime).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(screen.getByText(new RegExp(timeText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
  });

  it('renders cross-cutting alerts with "ภาพรวม" label when obsIndex === -1', () => {
    const alerts: CdssAlertDto[] = [
      { severity: 'WARN', section: 'TIME', message: 'cross-cut overall', obsIndex: -1 },
    ];

    render(<AlertSummaryPanel alerts={alerts} observations={[]} />);

    expect(screen.getByText(/cross-cut overall/)).toBeTruthy();
    expect(screen.getByText(/ภาพรวม/)).toBeTruthy();
  });

  it('uses Thai labels for every CdssSection', () => {
    const observations: PartographObservationDto[] = [
      makeObservation({ observeDatetime: '2026-04-19T08:00:00Z' }),
    ];
    const sections: { section: CdssAlertDto['section']; expected: string }[] = [
      { section: 'FHR', expected: 'เสียงหัวใจทารก' },
      { section: 'LIQUOR', expected: 'น้ำคร่ำ' },
      { section: 'MOULDING', expected: 'กะโหลกเกยกัน' },
      { section: 'CERVIX', expected: 'ปากมดลูก' },
      { section: 'DESCENT', expected: 'การลดต่ำศีรษะ' },
      { section: 'CONTRACTIONS', expected: 'การหดรัดตัว' },
      { section: 'OXY', expected: 'ออกซิโทซิน' },
      { section: 'PULSE', expected: 'ชีพจร' },
      { section: 'BP', expected: 'ความดันโลหิต' },
      { section: 'TEMP', expected: 'อุณหภูมิ' },
      { section: 'URINE', expected: 'ปัสสาวะ' },
      { section: 'TIME', expected: 'เวลาสังเกต' },
    ];

    for (const { section, expected } of sections) {
      const alerts: CdssAlertDto[] = [
        { severity: 'INFO', section, message: `msg-${section}`, obsIndex: 0 },
      ];
      const { unmount } = render(
        <AlertSummaryPanel alerts={alerts} observations={observations} />,
      );
      expect(screen.getByText(new RegExp(expected))).toBeTruthy();
      unmount();
    }
  });
});
