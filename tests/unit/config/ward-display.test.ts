// tests/unit/config/ward-display.test.ts
import { describe, it, expect } from 'vitest';
import {
  BED_MOVE_ALERTS,
  LABOUR_STAGE_DISPLAY,
  UNPLACED_SECTION,
  WARD_FEED_STATUS,
  allergyStatus,
  formatRoomSummary,
  labourStageDisplay,
  sharedBedNotice,
  unplacedBedLabel,
} from '@/config/ward-display';
import { LABOUR_PHASE_LABEL_TH } from '@/config/obstetric-display';

describe('ward-display', () => {
  it('feed status: Thai label + tone per health', () => {
    expect(WARD_FEED_STATUS).toEqual({
      ok: { labelTh: 'เชื่อมต่อ HOSxP สด', tone: 'ok', pulse: false },
      reconnecting: { labelTh: 'กำลังเชื่อมต่อ HOSxP ใหม่…', tone: 'warn', pulse: true },
      error: { labelTh: 'ขาดการเชื่อมต่อ HOSxP', tone: 'danger', pulse: true },
    });
  });
  it('bed-move alerts keep the page’s Thai copy, split into what happened / what to do', () => {
    expect(BED_MOVE_ALERTS.writeFailed.title).toBe('ย้ายเตียงไม่สำเร็จ — เตียงอาจถูกย้ายแล้วแต่บันทึกประวัติไม่ครบ');
    expect(BED_MOVE_ALERTS.writeFailed.remedy).toBe('ตรวจสอบสถานะเตียงใน HOSxP แล้วกด รีเฟรช ก่อนลองใหม่');
    expect(BED_MOVE_ALERTS.locked).toEqual({
      title: 'ย้ายเตียงไม่ได้ — เตียงปลายทางถูกล็อก',
      remedy: 'ปลดล็อกเตียงใน HOSxP ก่อน หรือเลือกเตียงว่างอื่น',
      tone: 'warn',
    });
    expect(BED_MOVE_ALERTS.occupied).toEqual({
      title: 'ย้ายเตียงไม่ได้ — เตียงปลายทางไม่ว่าง',
      remedy: 'เลือกเตียงที่ว่างและไม่ถูกล็อก แล้วลองอีกครั้ง',
      tone: 'warn',
    });
  });
});

describe('ward-display — stage pill + room summary', () => {
  it('stage labels reuse the shared Thai phase words; tones follow spec D4', () => {
    expect(LABOUR_PHASE_LABEL_TH).toEqual({ latent: 'ระยะแฝง', active: 'ระยะเร่ง', transition: 'ระยะเปลี่ยนผ่าน' });
    expect(LABOUR_STAGE_DISPLAY.prolongedLatent).toMatchObject({
      labelTh: 'ระยะแฝงนาน · ประเมินด่วน',
      className: 'bg-danger text-white',
      hint: 'รับเข้า ≥12 ชม. และปากมดลูก <4 ซม. หรือยังไม่มีบันทึก',
    });
    expect(LABOUR_STAGE_DISPLAY.transition).toMatchObject({
      labelTh: 'ระยะที่ 1 · ระยะเปลี่ยนผ่าน',
      className: 'bg-warn-tint text-warn-text',
    });
    expect(LABOUR_STAGE_DISPLAY.active).toMatchObject({ labelTh: 'ระยะที่ 1 · ระยะเร่ง', className: 'bg-ok-tint text-ok-text' });
    expect(LABOUR_STAGE_DISPLAY.latent).toMatchObject({
      labelTh: 'ระยะที่ 1 · ระยะแฝง',
      className: 'bg-brand-soft text-brand-strong',
    });
  });

  it('room summary: unpadded counts, locked only when present', () => {
    const base = {
      totalBeds: 5,
      occupied: 3,
      patients: 3,
      unplaced: 0,
      sharedBeds: 0,
      free: 2,
      lockedEmpty: 0,
      lockedOccupied: 0,
      prolongedLatent: 0,
      occupancyPct: 60,
    };
    expect(formatRoomSummary(base)).toBe('5 เตียง · มีผู้คลอด 3 · ว่าง 2');
    expect(formatRoomSummary({ ...base, lockedEmpty: 2 })).toBe('5 เตียง · มีผู้คลอด 3 · ว่าง 2 · ปิดใช้งาน 2');
  });

  it('I2: room summary counts patients (not rows per tile) and calls out a shared bed', () => {
    const base = {
      totalBeds: 2,
      occupied: 1,
      patients: 2,
      unplaced: 0,
      sharedBeds: 1,
      free: 1,
      lockedEmpty: 0,
      lockedOccupied: 0,
      prolongedLatent: 0,
      occupancyPct: 50,
    };
    expect(formatRoomSummary(base)).toBe('2 เตียง · มีผู้คลอด 2 · ว่าง 1 · เตียงซ้อน 1');
  });

  it('I2: unplaced section and shared-bed copy say what is wrong and what to do', () => {
    expect(UNPLACED_SECTION.title).toBe('ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง');
    expect(UNPLACED_SECTION.summary(2)).toBe(
      'ผู้คลอด 2 รายรับไว้ในวอร์ดนี้แต่ไม่มีเตียงในผัง — จัดหรือแก้เตียงใน HOSxP แล้วกด รีเฟรช',
    );
    expect(unplacedBedLabel({ reason: 'noBed', bedno: '' })).toBe('ยังไม่ได้จัดเตียง');
    expect(unplacedBedLabel({ reason: 'notInLayout', bedno: '99' })).toBe('เตียง 99 · ไม่อยู่ในผังวอร์ดนี้');
    expect(sharedBedNotice('01', 2)).toBe('เตียงซ้อน: 2 รายบนเตียง 01 ใน HOSxP — ตรวจและแก้เตียงใน HOSxP');
  });

  it('minor 7: prolonged latent with no cervix record has its own label; everything else is LABOUR_STAGE_DISPLAY', () => {
    expect(labourStageDisplay('prolongedLatent', null)).toMatchObject({
      labelTh: 'ยังไม่มีบันทึกปากมดลูก ≥12 ชม.',
      className: 'bg-danger text-white',
    });
    expect(labourStageDisplay('prolongedLatent', 3)).toBe(LABOUR_STAGE_DISPLAY.prolongedLatent);
    expect(labourStageDisplay('latent', null)).toBe(LABOUR_STAGE_DISPLAY.latent);
  });

  it('minor 9: allergy status — unknown is not "none"', () => {
    expect(allergyStatus(2)).toEqual({ kind: 'allergy', labelTh: 'แพ้ยา', titleTh: 'มีประวัติแพ้ยา 2 รายการ' });
    expect(allergyStatus(0)).toEqual({ kind: 'none', labelTh: 'ไม่มีประวัติแพ้ยา', titleTh: 'ไม่มีประวัติแพ้ยาในระบบ' });
    for (const missing of [null, undefined]) {
      expect(allergyStatus(missing)).toEqual({
        kind: 'unknown',
        labelTh: 'ไม่ทราบประวัติแพ้ยา',
        titleTh: 'HOSxP ไม่ส่งข้อมูลการแพ้ยา — ซักประวัติและตรวจใน HOSxP ก่อนให้ยา',
      });
    }
  });
});


// ─── Ward summary redesign (feat/ward-summary) ─────────────────────────────
import {
  BED_TILE_SECTION_EMPTY_TH,
  BED_TILE_SECTION_FIELDS,
  BED_TILE_SECTIONS,
  PROLONGED_LATENT_HINT,
  PROLONGED_LATENT_RULE_TH,
  capacityAriaLabel,
  capacityFooterNotes,
  isBedTileSectionEmpty,
  wardFeedChipDetail,
  wardFeedChipLabel,
} from '@/config/ward-display';
import { PROLONGED_LATENT_RULE, type BedSummary } from '@/services/ward-board';
import { makeOccupant } from '../../helpers/ward-fixtures';

const SUMMARY: BedSummary = {
  totalBeds: 9,
  occupied: 4,
  patients: 4,
  unplaced: 0,
  sharedBeds: 0,
  free: 3,
  lockedEmpty: 2,
  lockedOccupied: 0,
  prolongedLatent: 1,
  occupancyPct: 44,
};

describe('ward-display — ward summary', () => {
  it('prolonged-latent rule text is built from PROLONGED_LATENT_RULE, never restated', () => {
    expect(PROLONGED_LATENT_RULE_TH).toBe(
      `รับเข้า ≥${PROLONGED_LATENT_RULE.minHours} ชม. · ปากมดลูก <${PROLONGED_LATENT_RULE.cervixBelowCm} ซม.`,
    );
    expect(PROLONGED_LATENT_RULE_TH).toBe('รับเข้า ≥12 ชม. · ปากมดลูก <4 ซม.');
    expect(PROLONGED_LATENT_HINT.title).toBe('ระยะแฝงนาน');
    expect(PROLONGED_LATENT_HINT.body).toContain('อย่างน้อย 12 ชั่วโมง');
  });

  it('capacity aria-label states every bed count in Thai (the bar is beds, not patients)', () => {
    expect(capacityAriaLabel(SUMMARY)).toBe('เตียงทั้งหมด 9 เตียง: มีผู้คลอด 4 เตียง, ว่าง 3 เตียง, ปิด 2 เตียง');
    expect(capacityAriaLabel({ ...SUMMARY, totalBeds: 0, occupied: 0, free: 0, lockedEmpty: 0 })).toBe(
      'วอร์ดนี้ยังไม่มีเตียงในผัง',
    );
  });

  it('capacity footer notes appear only when > 0, so unplaced patients are never invisible', () => {
    expect(capacityFooterNotes(SUMMARY)).toEqual([]);
    expect(capacityFooterNotes({ ...SUMMARY, lockedOccupied: 1, unplaced: 2, sharedBeds: 1 })).toEqual([
      'ผู้คลอดบนเตียงล็อก 1',
      'ยังไม่ได้จัดเตียง 2',
      'เตียงซ้อน 1',
    ]);
  });

  it('feed chip: the ward’s own update time rides in the live pill; no time → the bare label', () => {
    // The live label carries status only; the time is a separate, non-live
    // detail so screen readers don't re-announce it on every 20 s refresh.
    expect(wardFeedChipLabel('ok')).toBe('เชื่อมต่อ HOSxP สด');
    expect(wardFeedChipLabel('error')).toBe('ขาดการเชื่อมต่อ HOSxP');
    expect(wardFeedChipLabel('reconnecting')).toBe('กำลังเชื่อมต่อ HOSxP ใหม่…');
    expect(wardFeedChipDetail('2026-10-12T03:32:00.000Z')).toBe('อัปเดต 10:32');
    expect(wardFeedChipDetail(null)).toBeUndefined();
    expect(wardFeedChipDetail('not-a-date')).toBeUndefined();
  });
});

describe('ward-display — bed-tile empty sections', () => {
  const blank = makeOccupant({ an: 'AN-B', bedno: '01', roomno: 'LR1' });

  it('every section is "all empty" for a patient with nothing recorded', () => {
    for (const s of BED_TILE_SECTIONS) expect(isBedTileSectionEmpty(blank, s)).toBe(true);
    expect(BED_TILE_SECTION_EMPTY_TH).toBe('ยังไม่มีบันทึก');
  });

  it('blank strings and undefined count as empty; zero is a recorded value', () => {
    expect(isBedTileSectionEmpty({ ...blank, last_iv_fluids: '  ' }, 'fluids')).toBe(true);
    expect(isBedTileSectionEmpty({ ...blank, last_spo2: undefined as unknown as null }, 'vitals')).toBe(true);
    expect(isBedTileSectionEmpty({ ...blank, last_pain: 0 }, 'progress')).toBe(false);
    expect(isBedTileSectionEmpty({ ...blank, last_oxytocin_drops: 0 }, 'fluids')).toBe(false);
  });

  it.each(
    Object.entries(BED_TILE_SECTION_FIELDS).flatMap(([section, fields]) =>
      fields.map((f) => [section, f] as const),
    ),
  )('%s: a value in %s alone makes the section non-empty (never hide a recorded value)', (section, field) => {
    const o = { ...blank, [field]: 1 };
    expect(isBedTileSectionEmpty(o, section as (typeof BED_TILE_SECTIONS)[number])).toBe(false);
  });

  it('each section lists exactly the fields its tile block renders', () => {
    expect(BED_TILE_SECTION_FIELDS).toEqual({
      admission: [
        'incharge_doctor_name',
        'pttype_name',
        'last_weight',
        'admit_bw_kg',
        'last_height',
        'patient_height',
        'last_bsa',
        'prediag',
      ],
      vitals: ['last_bp_sys', 'last_bp_dia', 'last_temp', 'last_pulse', 'last_rr', 'last_spo2', 'last_spo2_o2'],
      progress: ['last_cervix_cm', 'last_station', 'last_amniotic', 'last_pain'],
      contractionFhr: ['last_contr_freq', 'last_contr_duration', 'last_contr_strength', 'last_fhr'],
      fluids: ['last_iv_fluids', 'last_oxytocin_uml', 'last_oxytocin_drops'],
    });
  });
});
