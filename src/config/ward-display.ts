// src/config/ward-display.ts
// Ward-board copy and tones: Thai labels for the live-feed chip and the
// bed-move alerts (this task), the labour-stage pill and the room summary
// (Task 5). Rules live in src/services/ward-board.ts; this file is display only.
import type { WardFeedHealth } from '@/hooks/useMaternityWardStateFull';
import type { StatusTone } from '@/config/status-tone';
import type { BedOccupancyFull } from '@/types/maternity-ward';
import { bangkokClock } from '@/lib/sync-age';
import {
  LABOUR_STAGE_CM,
  PROLONGED_LATENT_RULE,
  type BedSummary,
  type LabourStageKind,
  type UnplacedReason,
} from '@/services/ward-board';
import { LABOUR_PHASE_LABEL_TH } from '@/config/obstetric-display';

export const WARD_FEED_STATUS: Record<
  WardFeedHealth,
  { labelTh: string; tone: StatusTone; pulse: boolean }
> = {
  ok: { labelTh: 'เชื่อมต่อ HOSxP สด', tone: 'ok', pulse: false },
  reconnecting: { labelTh: 'กำลังเชื่อมต่อ HOSxP ใหม่…', tone: 'warn', pulse: true },
  error: { labelTh: 'ขาดการเชื่อมต่อ HOSxP', tone: 'danger', pulse: true },
};

/** The live pill's status label (announced to screen readers on change). */
export function wardFeedChipLabel(health: WardFeedHealth): string {
  return WARD_FEED_STATUS[health].labelTh;
}

/** Label for the HOSxP → NN-LRMS sync chip on the ward board. The live pill
 *  already says "HOSxP" (this page reads HOSxP directly), so the sync chip
 *  names where the data goes instead — the same pipeline `/` calls "HOSxP". */
export const WARD_SYNC_CHIP_LABEL = 'ส่งข้อมูลเข้า NN-LRMS';

/** The ward's own update time for the live pill ("อัปเดต HH:MM") — the page's
 *  single freshness indicator; nothing for an unknown or unparseable time. */
export function wardFeedChipDetail(lastUpdatedAt: string | null): string | undefined {
  const t = lastUpdatedAt ? new Date(lastUpdatedAt) : null;
  return t && Number.isFinite(t.getTime()) ? `อัปเดต ${bangkokClock(t)}` : undefined;
}

/** Bed-move outcomes: today's page copy, split into what happened / what to do. */
export const BED_MOVE_ALERTS = {
  writeFailed: {
    title: 'ย้ายเตียงไม่สำเร็จ — เตียงอาจถูกย้ายแล้วแต่บันทึกประวัติไม่ครบ',
    remedy: 'ตรวจสอบสถานะเตียงใน HOSxP แล้วกด รีเฟรช ก่อนลองใหม่',
    tone: 'danger',
  },
  locked: {
    title: 'ย้ายเตียงไม่ได้ — เตียงปลายทางถูกล็อก',
    remedy: 'ปลดล็อกเตียงใน HOSxP ก่อน หรือเลือกเตียงว่างอื่น',
    tone: 'warn',
  },
  occupied: {
    title: 'ย้ายเตียงไม่ได้ — เตียงปลายทางไม่ว่าง',
    remedy: 'เลือกเตียงที่ว่างและไม่ถูกล็อก แล้วลองอีกครั้ง',
    tone: 'warn',
  },
} as const satisfies Record<string, { title: string; remedy: string; tone: 'danger' | 'warn' }>;

const { minHours, cervixBelowCm } = PROLONGED_LATENT_RULE;
const { activeFrom, transitionFrom } = LABOUR_STAGE_CM;

/** Stage pill on each bed tile (spec D4: today's colour mapping, as tokens). */
export const LABOUR_STAGE_DISPLAY: Record<
  LabourStageKind,
  { labelTh: string; className: string; hint: string }
> = {
  prolongedLatent: {
    labelTh: 'ระยะแฝงนาน · ประเมินด่วน',
    className: 'bg-danger text-white',
    hint: `รับเข้า ≥${minHours} ชม. และปากมดลูก <${cervixBelowCm} ซม. หรือยังไม่มีบันทึก`,
  },
  transition: {
    labelTh: `ระยะที่ 1 · ${LABOUR_PHASE_LABEL_TH.transition}`,
    className: 'bg-warn-tint text-warn-text',
    hint: `ปากมดลูก ≥${transitionFrom} ซม.`,
  },
  active: {
    labelTh: `ระยะที่ 1 · ${LABOUR_PHASE_LABEL_TH.active}`,
    className: 'bg-ok-tint text-ok-text',
    hint: `ปากมดลูก ≥${activeFrom} และ <${transitionFrom} ซม.`,
  },
  latent: {
    labelTh: `ระยะที่ 1 · ${LABOUR_PHASE_LABEL_TH.latent}`,
    className: 'bg-brand-soft text-brand-strong',
    hint: `ปากมดลูก <${activeFrom} ซม. หรือยังไม่มีบันทึก`,
  },
};

/** Same rule and alarm as prolongedLatent, but the cervix was never recorded:
 *  the tile says what is missing rather than implying a slow labour. */
const PROLONGED_LATENT_NO_CERVIX = {
  ...LABOUR_STAGE_DISPLAY.prolongedLatent,
  labelTh: `ยังไม่มีบันทึกปากมดลูก ≥${minHours} ชม.`,
  hint: `รับเข้า ≥${minHours} ชม. และยังไม่มีบันทึกปากมดลูก — ตรวจและบันทึกในพาร์โทกราฟ`,
};

/** Stage pill for a tile. The stage rule is classifyLabourStage; only the
 *  wording changes when a prolonged-latent patient has no cervix record. */
export function labourStageDisplay(
  stage: LabourStageKind,
  cervixCm: number | null,
): (typeof LABOUR_STAGE_DISPLAY)[LabourStageKind] {
  return stage === 'prolongedLatent' && cervixCm === null
    ? PROLONGED_LATENT_NO_CERVIX
    : LABOUR_STAGE_DISPLAY[stage];
}

/** Allergy pill. A missing count is "unknown" — never "no allergy history". */
export function allergyStatus(count: number | null | undefined): {
  kind: 'allergy' | 'none' | 'unknown';
  labelTh: string;
  titleTh: string;
} {
  if (count === null || count === undefined) {
    return {
      kind: 'unknown',
      labelTh: 'ไม่ทราบประวัติแพ้ยา',
      titleTh: 'HOSxP ไม่ส่งข้อมูลการแพ้ยา — ซักประวัติและตรวจใน HOSxP ก่อนให้ยา',
    };
  }
  if (count > 0)
    return { kind: 'allergy', labelTh: 'แพ้ยา', titleTh: `มีประวัติแพ้ยา ${count} รายการ` };
  return { kind: 'none', labelTh: 'ไม่มีประวัติแพ้ยา', titleTh: 'ไม่มีประวัติแพ้ยาในระบบ' };
}

/** Room header line. "มีผู้คลอด" is patients (a shared bed holds two), so the
 *  room lines plus the unplaced section add up to the ward KPI. */
export function formatRoomSummary(s: BedSummary): string {
  const parts = [`${s.totalBeds} เตียง`, `มีผู้คลอด ${s.patients}`, `ว่าง ${s.free}`];
  if (s.lockedEmpty > 0) parts.push(`ปิดใช้งาน ${s.lockedEmpty}`);
  if (s.sharedBeds > 0) parts.push(`เตียงซ้อน ${s.sharedBeds}`);
  return parts.join(' · ');
}

/** I2: admitted patients with a blank bed or a bed outside this ward's layout. */
export const UNPLACED_SECTION = {
  title: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง',
  summary: (n: number) =>
    `ผู้คลอด ${n} รายรับไว้ในวอร์ดนี้แต่ไม่มีเตียงในผัง — จัดหรือแก้เตียงใน HOSxP แล้วกด รีเฟรช`,
} as const;

/** Tile head for an unplaced patient (replaces "เตียง {bedno}"). */
export function unplacedBedLabel(u: { reason: UnplacedReason; bedno: string | null }): string {
  return u.reason === 'noBed' ? 'ยังไม่ได้จัดเตียง' : `เตียง ${u.bedno} · ไม่อยู่ในผังวอร์ดนี้`;
}

/** Notice for newborn admissions (HOSxP admit type แรกเกิด) on this ward's beds.
 *  They are left out of every count on the board — say so, and how to fix it. */
export function newbornsInWardNotice(bednos: string[]): string {
  const beds = bednos.map((b) => b.trim()).filter((b) => b !== '');
  const where = beds.length > 0 ? ` (เตียง ${beds.join(', ')})` : '';
  return (
    `ทารกแรกเกิด ${bednos.length} ราย ถูก admit อยู่ในเตียงของวอร์ดนี้${where} — ` +
    'ไม่นับเป็นผู้คลอดหรือเตียงที่ใช้ในหน้านี้ · หากไม่ใช่เตียงของทารก ให้แก้เตียง/วอร์ดของทารกใน HOSxP'
  );
}

/** Conflict notice above a bed HOSxP has given to more than one admission. */
export function sharedBedNotice(bedno: string, count: number): string {
  return `เตียงซ้อน: ${count} รายบนเตียง ${bedno} ใน HOSxP — ตรวจและแก้เตียงใน HOSxP`;
}

// ─── Ward summary (capacity + urgent panels) ────────────────────────────────

/** The prolonged-latent rule as one line, from PROLONGED_LATENT_RULE. */
export const PROLONGED_LATENT_RULE_TH = `รับเข้า ≥${minHours} ชม. · ปากมดลูก <${cervixBelowCm} ซม.`;

export const PROLONGED_LATENT_HINT = {
  title: 'ระยะแฝงนาน',
  body: `นับผู้คลอดที่รับเข้ามาแล้วอย่างน้อย ${minHours} ชั่วโมง และปากมดลูกยังไม่ถึง ${cervixBelowCm} ซม. หรือยังไม่มีบันทึก — เกณฑ์เดียวกับป้ายบนการ์ดเตียง ควรประเมินตามเส้นปฏิบัติการของพาร์โทกราฟ`,
} as const;

/** Capacity-bar segments, in bar order. Every segment counts BEDS; the
 *  legend's "มีผู้คลอด" number is patients (see WardKpis). */
export const CAPACITY_SEGMENTS = [
  { key: 'occupied', labelTh: 'มีผู้คลอด', className: 'bg-brand' },
  { key: 'free', labelTh: 'ว่าง', className: 'border border-ok/40 bg-ok-tint' },
  { key: 'locked', labelTh: 'ปิด', className: 'border border-border bg-hatch-neutral' },
] as const;

export type CapacitySegment = (typeof CAPACITY_SEGMENTS)[number]['key'];

/** Beds per capacity segment; the three always sum to totalBeds. */
export function capacityBeds(s: BedSummary): Record<CapacitySegment, number> {
  return { occupied: s.occupied, free: s.free, locked: s.lockedEmpty };
}

/** The capacity bar is BEDS: occupied beds + free + locked-empty = totalBeds. */
export function capacityAriaLabel(s: BedSummary): string {
  if (s.totalBeds === 0) return 'วอร์ดนี้ยังไม่มีเตียงในผัง';
  return `เตียงทั้งหมด ${s.totalBeds} เตียง: มีผู้คลอด ${s.occupied} เตียง, ว่าง ${s.free} เตียง, ปิด ${s.lockedEmpty} เตียง`;
}

/** Footer call-outs after "เตียงทั้งหมด N", each only when it is > 0 — a
 *  patient without a usable bed is never invisible in the summary (I2). */
export function capacityFooterNotes(s: BedSummary): string[] {
  return [
    s.lockedOccupied > 0 ? `ผู้คลอดบนเตียงล็อก ${s.lockedOccupied}` : null,
    s.unplaced > 0 ? `ยังไม่ได้จัดเตียง ${s.unplaced}` : null,
    s.sharedBeds > 0 ? `เตียงซ้อน ${s.sharedBeds}` : null,
  ].filter((p): p is string => p !== null);
}

// ─── Bed-tile sections ──────────────────────────────────────────────────────

/** The clinical blocks of an occupied bed tile and the fields each renders. */
export const BED_TILE_SECTION_FIELDS = {
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
  vitals: [
    'last_bp_sys',
    'last_bp_dia',
    'last_temp',
    'last_pulse',
    'last_rr',
    'last_spo2',
    'last_spo2_o2',
  ],
  progress: ['last_cervix_cm', 'last_station', 'last_amniotic', 'last_pain'],
  contractionFhr: ['last_contr_freq', 'last_contr_duration', 'last_contr_strength', 'last_fhr'],
  fluids: ['last_iv_fluids', 'last_oxytocin_uml', 'last_oxytocin_drops'],
} as const satisfies Record<string, ReadonlyArray<keyof BedOccupancyFull>>;

export type BedTileSection = keyof typeof BED_TILE_SECTION_FIELDS;
export const BED_TILE_SECTIONS = Object.keys(BED_TILE_SECTION_FIELDS) as BedTileSection[];

/** Headings for the tile blocks (the admission block has none while it shows values). */
export const BED_TILE_SECTION_TITLE: Record<BedTileSection, string> = {
  admission: 'แพทย์ · สิทธิ · ร่างกาย',
  vitals: 'สัญญาณชีพ (บันทึกพยาบาล)',
  progress: 'ความก้าวหน้าการคลอด (พาร์โทกราฟ)',
  contractionFhr: 'การหดรัดตัว · FHR',
  fluids: 'สารน้ำและยา',
};

export const BED_TILE_SECTION_EMPTY_TH = 'ยังไม่มีบันทึก';

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** True only when EVERY field of the section is null/undefined/blank. One
 *  recorded value (0 included) and the tile renders the whole block as before. */
export function isBedTileSectionEmpty(o: BedOccupancyFull, section: BedTileSection): boolean {
  return BED_TILE_SECTION_FIELDS[section].every((f) => isBlank(o[f]));
}
