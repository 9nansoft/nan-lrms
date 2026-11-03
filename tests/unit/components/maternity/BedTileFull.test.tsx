/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { BedTileFull } from '@/components/maternity/BedTileFull';
import type { BedOccupancyFull } from '@/types/maternity-ward';
import type { MaternalScreenSummaryItem } from '@/types/api';
import { assertNoGreenInTree } from '../../../helpers/assertNoGreen';

// Forbidden green tokens — mirrors tests/unit/components/MaternalScreenCell.test.tsx
// and tests/unit/config/maternal-screen-display.test.ts (GC-U1 regression lock);
// shared scan now lives in tests/helpers/assertNoGreen.ts (rgb()-aware, Phase 6 M1).

const now = new Date('2026-04-19T14:00:00').getTime();

const occupant: BedOccupancyFull = {
  an: 'AN1',
  hn: 'HN1',
  regdate: '2026-04-19',
  regtime: '10:00:00',
  ward: '03',
  bedno: '01',
  roomno: 'LR1',
  bedtype: null,
  roomname: 'LR1',
  pname: 'นาง',
  fname: 'ทดสอบ',
  lname: 'ระบบ',
  birthday: '1996-04-19',
  blood_grp: 'O',
  allergy_count: 1,
  pttype_name: 'ประกันสุขภาพถ้วนหน้า',
  prediag: 'เจ็บครรภ์คลอด',
  admit_bw_kg: 58,
  patient_height: 160,
  gravida: 2,
  ga: 38,
  incharge_doctor_name: 'ดร.X',
  last_observation_at: '2026-04-19T11:30:00',
  last_cervix_cm: 4,
  last_station: '-1',
  last_fhr: 142,
  last_contr_freq: 3,
  last_contr_duration: 45,
  last_contr_strength: 'moderate',
  last_oxytocin_uml: 4,
  last_oxytocin_drops: 12,
  last_iv_fluids: 'RLS',
  last_amniotic: 'clear',
  last_bp_sys: 120,
  last_bp_dia: 80,
  last_temp: 37.2,
  last_pulse: 88,
  last_rr: 20,
  last_spo2: 98,
  last_spo2_o2: 99,
  last_weight: 59,
  last_height: 161,
  last_bsa: 1.62,
  last_pain: 6,
  last_assess_date: '2026-04-19',
  last_assess_time: '11:30:00',
  last_assess_staff: 'nurse1',
};

describe('BedTileFull', () => {
  it('renders HOSxP admit context, latest vitals, and labour data on the ward bed card', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);

    // Name is masked for PDPA display (maskName) → "นาง ทดสอบ ร.".
    expect(screen.getByText(/นาง ทดสอบ ร\./)).toBeInTheDocument();
    expect(screen.getByText('AN1')).toBeInTheDocument();
    expect(screen.getByText('HN1')).toBeInTheDocument();
    expect(screen.getByText('แพ้ยา')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByText('ดร.X')).toBeInTheDocument();
    expect(screen.getByText('ประกันสุขภาพถ้วนหน้า')).toBeInTheDocument();
    expect(screen.getByText('BW 59 kg · Ht 161 cm · BSA 1.62')).toBeInTheDocument();
    expect(screen.getByText('เจ็บครรภ์คลอด')).toBeInTheDocument();
    expect(screen.getByText('120/80')).toBeInTheDocument();
    expect(screen.getByText('37.2')).toBeInTheDocument();
    expect(screen.getByText('98')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('fires onClick with AN when an occupied bed card is clicked', () => {
    const onClick = vi.fn();
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('bed-01'));
    expect(onClick).toHaveBeenCalledWith('AN1');
  });

  it('shows the patient-photo placeholder (no fetch) when rendered without a BMS session', () => {
    // config is omitted here (as in the ward page before a session is ready),
    // so PatientPhoto renders its neutral placeholder rather than fetching.
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);
    expect(screen.getByTestId('patient-photo-placeholder')).toBeInTheDocument();
  });

  it('prolonged latent is the only tile alarm; the FHR dot is brand, motion-safe, and only with a reading', () => {
    const { rerender } = render(
      <BedTileFull bedno="01" bedLock="N" occupant={{ ...occupant, regtime: '01:00:00', last_cervix_cm: 3 }} now={now} />,
    );
    const crit = screen.getByTestId('bed-01');
    expect(crit.dataset.stage).toBe('prolongedLatent');
    expect(crit.className).toContain('border-danger');
    const dot = screen.getByTestId('fhr-pulse');
    expect(dot.className).toContain('bg-brand');
    expect(dot.className).toContain('motion-safe:');
    rerender(<BedTileFull bedno="01" bedLock="N" occupant={{ ...occupant, last_fhr: null }} now={now} />);
    expect(screen.queryByTestId('fhr-pulse')).toBeNull();
  });

  it('labels are Thai; clinical abbreviations stay', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);
    for (const t of [
      'เตียง 01',
      'สัญญาณชีพ (บันทึกพยาบาล)',
      'ความก้าวหน้าการคลอด (พาร์โทกราฟ)',
      'การหดรัดตัว',
      'สารน้ำและยา',
      'แพทย์',
      'สิทธิ',
      'อาการแรกรับ',
      '4 ซม.',
      '3/10 นาที · 45 วินาที · moderate',
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    for (const t of ['BED', 'Vitals', 'Labour Progress', 'Interventions', 'Doctor', 'NKDA', 'Admit']) {
      expect(screen.queryByText(t)).toBeNull();
    }
  });

  it('B1: a patient on a locked bed stays visible, flagged as locked in HOSxP', () => {
    render(<BedTileFull bedno="01" bedLock="Y" occupant={occupant} now={now} />);
    expect(screen.getByText(/นาง ทดสอบ ร\./)).toBeInTheDocument();
    expect(screen.getByTestId('bed-locked-occupied')).toHaveTextContent('เตียงถูกล็อกใน HOSxP');
    expect(screen.queryByText('ปิดบำรุง')).toBeNull();
  });
});

// Phase 6 Task H4 — cross-source maternal-screen pills
// (docs/superpowers/plans/2026-07-17-maternal-screening-hosxp.md GC-H3/GC-H4).
describe('BedTileFull — maternal-screen pills (Task H4)', () => {
  const severeSummary: MaternalScreenSummaryItem = {
    an: 'AN1',
    localTier: 'LOCAL_SEVERE',
    emergencyAcuity: 'EMERGENCY',
    isComplete: true,
    assessedAt: '2026-04-19T13:30:00',
  };

  it('renders both pills with the correct testid + inline light-token colors for a severe summary', () => {
    render(
      <BedTileFull
        bedno="01"
        bedLock="N"
        occupant={occupant}
        now={now}
        maternalScreenSummary={severeSummary}
      />,
    );
    const wrap = screen.getByTestId('bed-maternal-screen');
    expect(wrap).toBeInTheDocument();
    expect(wrap.getAttribute('title')).toBe('การคัดกรองท้องถิ่น (โหมดเงา — ยังไม่ได้รับการรับรอง)');
    // Thai short labels from the display-config Records.
    expect(screen.getByText('ระดับรุนแรง (ท้องถิ่น)')).toBeInTheDocument();
    expect(screen.getByText('ฉุกเฉิน')).toBeInTheDocument();
    // Both pills use the light `var(--risk-high)` token (LOCAL_SEVERE / EMERGENCY).
    const pills = wrap.querySelectorAll('span[style]');
    const styles = Array.from(pills).map((p) => p.getAttribute('style') ?? '');
    expect(styles.filter((s) => s.includes('var(--risk-high)')).length).toBeGreaterThanOrEqual(2);
  });

  it('renders zero DOM for the maternal-screen slot when no summary is supplied — rest of the tile unchanged', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);
    expect(screen.queryByTestId('bed-maternal-screen')).not.toBeInTheDocument();
    // Existing identity-row pills (Allergy/blood group) and core fields still render.
    expect(screen.getByText('แพ้ยา')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByText('AN1')).toBeInTheDocument();
    expect(screen.getByTestId('bed-01')).toBeInTheDocument();
  });

  it('renders zero DOM for the maternal-screen slot when the summary has both axes null', () => {
    render(
      <BedTileFull
        bedno="01"
        bedLock="N"
        occupant={occupant}
        now={now}
        maternalScreenSummary={{
          an: 'AN1',
          localTier: null,
          emergencyAcuity: null,
          isComplete: null,
          assessedAt: null,
        }}
      />,
    );
    expect(screen.queryByTestId('bed-maternal-screen')).not.toBeInTheDocument();
  });

  it('renders only the tier pill when acuity is null', () => {
    render(
      <BedTileFull
        bedno="01"
        bedLock="N"
        occupant={occupant}
        now={now}
        maternalScreenSummary={{
          an: 'AN1',
          localTier: 'LOCAL_MILD',
          emergencyAcuity: null,
          isComplete: null,
          assessedAt: null,
        }}
      />,
    );
    expect(screen.getByText('ระดับเฝ้าระวัง (ท้องถิ่น)')).toBeInTheDocument();
    expect(screen.queryByText('คงที่ (โหมดเงา)')).not.toBeInTheDocument();
  });

  it('no-green scan: STABLE/NO_LOCAL_MATCH renders muted tokens, never green, anywhere in the tile', () => {
    const { container } = render(
      <BedTileFull
        bedno="01"
        bedLock="N"
        occupant={occupant}
        now={now}
        maternalScreenSummary={{
          an: 'AN1',
          localTier: 'NO_LOCAL_MATCH',
          emergencyAcuity: 'STABLE',
          isComplete: true,
          assessedAt: null,
        }}
      />,
    );
    const wrap = screen.getByTestId('bed-maternal-screen');
    const pills = wrap.querySelectorAll('span[style]');
    const styles = Array.from(pills).map((p) => p.getAttribute('style') ?? '');
    expect(styles.some((s) => s.includes('var(--ink-navy-muted)'))).toBe(true);
    assertNoGreenInTree(container);
  });

  it('an EMERGENCY summary on a non-crit occupant does NOT alter the tile-level border/shadow (GC-H3 red is reserved for the crit alarm)', () => {
    const { rerender } = render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);
    const plain = screen.getByTestId('bed-01');
    const before = { className: plain.className, style: plain.getAttribute('style') };
    rerender(
      <BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} maternalScreenSummary={severeSummary} />,
    );
    const article = screen.getByTestId('bed-01');
    expect(article.className).toBe(before.className);
    expect(article.getAttribute('style')).toBe(before.style);
    expect(article.dataset.stage).toBe('active');
    expect(article.className).not.toContain('border-danger'); // red stays reserved for the stage alarm (GC-H3)
  });
});

describe('BedTileFull — fix wave minors', () => {
  it('9: a missing allergy count reads "unknown", never "no allergy history"', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={{ ...occupant, allergy_count: null }} now={now} />);
    expect(screen.getByText('ไม่ทราบประวัติแพ้ยา')).toBeInTheDocument();
    expect(screen.queryByText('ไม่มีประวัติแพ้ยา')).toBeNull();
  });

  it('9: zero recorded allergies still reads "no allergy history"', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={{ ...occupant, allergy_count: 0 }} now={now} />);
    expect(screen.getByText('ไม่มีประวัติแพ้ยา')).toBeInTheDocument();
  });

  it('7: ≥12 h with NO cervix record says so; the alarm and stage rule are unchanged', () => {
    const o = { ...occupant, regdate: '2026-04-19', regtime: '01:00:00', last_cervix_cm: null };
    render(<BedTileFull bedno="01" bedLock="N" occupant={o} now={now} />);
    expect(screen.getByText('ยังไม่มีบันทึกปากมดลูก ≥12 ชม.')).toBeInTheDocument();
    expect(screen.queryByText('ระยะแฝงนาน · ประเมินด่วน')).toBeNull();
    const article = screen.getByTestId('bed-01');
    expect(article.dataset.stage).toBe('prolongedLatent');
    expect(article.className).toContain('border-danger');
  });

  it('7: ≥12 h with a recorded cervix < 4 cm keeps "ระยะแฝงนาน · ประเมินด่วน"', () => {
    const o = { ...occupant, regdate: '2026-04-19', regtime: '01:00:00', last_cervix_cm: 3 };
    render(<BedTileFull bedno="01" bedLock="N" occupant={o} now={now} />);
    expect(screen.getByText('ระยะแฝงนาน · ประเมินด่วน')).toBeInTheDocument();
  });
});

// ─── feat/ward-summary: compact vacant tiles, empty clinical sections ──────
describe('BedTileFull — compact vacant and locked tiles', () => {
  it.each([
    ['N', 'empty', 'เตียงว่าง', 'ว่าง', 'พร้อมรับผู้คลอด'],
    ['Y', 'locked', 'ปิดใช้งาน', 'ปิดบำรุง', 'ล็อกใน HOSxP'],
  ] as const)('bedLock %s → a short %s card: head, chip and status line, no forced height', (lock, stage, chip, word, line) => {
    render(<BedTileFull bedno="05" bedLock={lock} occupant={null} now={now} />);
    const tile = screen.getByTestId('bed-05');
    expect(tile.dataset.stage).toBe(stage);
    expect(tile).toHaveTextContent('เตียง 05');
    expect(screen.getByText(chip)).toBeInTheDocument();
    expect(screen.getByText(word)).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(tile.className).not.toMatch(/\bmin-h-/);
    expect(tile.querySelector('.flex-1')).toBeNull();
  });
});

describe('BedTileFull — a section with nothing recorded collapses to one muted line', () => {
  const blank: BedOccupancyFull = {
    ...occupant,
    incharge_doctor_name: null,
    pttype_name: null,
    prediag: null,
    admit_bw_kg: null,
    patient_height: null,
    last_weight: null,
    last_height: null,
    last_bsa: null,
    last_bp_sys: null,
    last_bp_dia: null,
    last_temp: null,
    last_pulse: null,
    last_rr: null,
    last_spo2: null,
    last_spo2_o2: null,
    last_cervix_cm: null,
    last_station: null,
    last_amniotic: null,
    last_pain: null,
    last_contr_freq: null,
    last_contr_duration: null,
    last_contr_strength: null,
    last_fhr: null,
    last_iv_fluids: null,
    last_oxytocin_uml: null,
    last_oxytocin_drops: null,
  };
  const section = (name: string) => document.querySelector<HTMLElement>(`[data-section="${name}"]`)!;

  it('all five sections empty → each keeps its heading plus "ยังไม่มีบันทึก", no dash grids', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={blank} now={now} />);
    for (const [name, heading] of [
      ['admission', 'แพทย์ · สิทธิ · ร่างกาย'],
      ['vitals', 'สัญญาณชีพ (บันทึกพยาบาล)'],
      ['progress', 'ความก้าวหน้าการคลอด (พาร์โทกราฟ)'],
      ['contractionFhr', 'การหดรัดตัว · FHR'],
      ['fluids', 'สารน้ำและยา'],
    ] as const) {
      const el = section(name);
      expect(el.dataset.empty).toBe('true');
      expect(el).toHaveTextContent(heading);
      expect(el).toHaveTextContent('ยังไม่มีบันทึก');
      expect(el).not.toHaveTextContent('—');
    }
    expect(screen.getAllByText('ยังไม่มีบันทึก')).toHaveLength(5);
    expect(screen.queryByText('BP')).toBeNull();
    expect(screen.queryByText('Oxytocin')).toBeNull();
    expect(screen.queryByTestId('fhr-pulse')).toBeNull();
  });

  it.each([
    ['admission', { pttype_name: 'UC' }, ['แพทย์', 'สิทธิ', 'ร่างกาย', 'UC']],
    ['vitals', { last_pulse: 88 }, ['BP', 'T (°C)', 'P', '88', 'SpO₂ RA']],
    ['progress', { last_pain: 0 }, ['ปากมดลูก', 'ส่วนนำ', 'ถุงน้ำ', '0/10']],
    ['contractionFhr', { last_fhr: 140 }, ['การหดรัดตัว', 'FHR (ครั้ง/นาที)', '140']],
    ['fluids', { last_oxytocin_drops: 0 }, ['IV', 'Oxytocin', 'หยด', '0 หยด/นาที']],
  ] as const)('%s: one recorded value renders the whole section exactly as before', (name, patch, texts) => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={{ ...blank, ...patch }} now={now} />);
    const el = section(name);
    expect(el.dataset.empty).toBe('false');
    expect(el).not.toHaveTextContent('ยังไม่มีบันทึก');
    for (const t of texts) expect(el).toHaveTextContent(t);
    expect(screen.getAllByText('ยังไม่มีบันทึก')).toHaveLength(4);
  });

  it('a fully recorded tile shows no "ยังไม่มีบันทึก" line at all', () => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={occupant} now={now} />);
    expect(screen.queryByText('ยังไม่มีบันทึก')).toBeNull();
    expect(document.querySelectorAll('[data-section][data-empty="false"]')).toHaveLength(5);
  });
});
