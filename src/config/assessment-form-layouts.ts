// The on-screen LAYOUT of the three [LR] nursing forms, mirroring how each
// form is drawn in HOSxP (docs/assessments/lr1-from.png for แรกรับ,
// lr3-from.png for ระยะคลอด, lr2-from.png for หลังคลอด — lr2/lr3 are the
// SITE's own form numbers, see tbl.txt).
//
// This file holds STRUCTURE only: which HOSxP column sits in which section
// or time row, and in what order. It deliberately holds NO labels — every
// label still comes from the site's own `assessment_items` (resolved at sync
// / pull time), so a hospital that renamed a field still shows its own text.
// A column that a site added beyond this standard structure is never lost:
// the viewer renders whatever the grouping helper could not place under an
// "อื่น ๆ" group.
import type { MaternityAssessmentKey } from '@/config/maternity-assessments';

/** How a section of the แรกรับ form renders its fields. */
export type AssessmentSectionStyle =
  /** Label/value lines in a wrapping two-column grid. */
  | 'fields'
  /** The Lab grid: rows × (มารดา: LAB1 / LAB2 / ข้อความ). */
  | 'lab-table'
  /** ไม่มี/มี checkbox pair with a memo box, one block per risk. */
  | 'risk-blocks'
  /** The numbered 1..16 ประวัติที่เกี่ยวกับปัจจุบัน pairs. */
  | 'numbered-risk'
  /** Compact labelled value boxes in one row (Vital sign). */
  | 'vital-row';

/** One Lab row's cells: [มารดา: LAB1, มารดา: LAB2, ข้อความ(อื่น)]. */
export interface AssessmentLabRow {
  cells: readonly [string | null, string | null, string | null];
}

/** One risk block: a ไม่มี/มี pair and the memo that explains it. */
export interface AssessmentRiskBlock {
  noColumn?: string;
  yesColumn?: string;
  memoColumn?: string;
}

/** One numbered item of การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร: the ไม่มี/มี pair. */
export interface AssessmentNumberedPair {
  /** 1-based item number on the LR1 paper form (1..16). */
  itemNumber: number;
  /** Subsection heading on the paper form (ประวัติอดีต / ประวัติปัจจุบัน). */
  group?: string;
  noColumn: string;
  yesColumn: string;
  /** Optional "ระบุ ..." text column attached to this item (e.g. items 6, 15, 16). */
  specifyColumn?: string;
}

export interface AssessmentSectionSpec {
  id: string;
  /** Section heading as the form draws it. */
  title: string;
  style: AssessmentSectionStyle;
  /** Ordered columns for the `fields` style (and extra lines under a table). */
  columns?: readonly string[];
  labRows?: readonly AssessmentLabRow[];
  riskBlocks?: readonly AssessmentRiskBlock[];
  numberedPairs?: readonly AssessmentNumberedPair[];
  /** ระบุ free-text boxes that belong under the numbered list. */
  numberedSpecifyColumns?: readonly string[];
}

export interface AssessmentFormLayout {
  formKey: MaternityAssessmentKey;
  sections: readonly AssessmentSectionSpec[];
}

/** One จม./เวลา row of a ระยะคลอด / หลังคลอด form. */
export interface AssessmentTimeRowSpec {
  timeColumn: string;
  staffColumn: string;
  subjectColumns: readonly string[];
  activityColumns: readonly string[];
}

export interface AssessmentTimeRowLayout {
  formKey: MaternityAssessmentKey;
  /** The form's date, drawn once above the grid. */
  dateColumn?: string;
  /** Heading of the two content cells, as the form's grid header reads. */
  subjectTitle: string;
  activityTitle: string;
  rows: readonly AssessmentTimeRowSpec[];
  /** Identity strip drawn under the grid (Hospital Number, physician…). */
  footerColumns: readonly string[];
}

// ─── LR1 · แรกรับ (asm_first_pregnant_pt_nan) ────────────────────────────────

const FIRST_PREGNANT_LAYOUT: AssessmentFormLayout = {
  formKey: 'first_pregnant',
  sections: [
    {
      id: 'history',
      title: 'ประวัติ',
      style: 'fields',
      columns: [
        'asm_date1',
        'asm_time1',
        'asm_text59',
        'asm_text60',
        'asm_text1',
        'asm_text2',
        'asm_text3',
        'asm_text4',
        'asm_text5',
        'asm_text6',
        'asm_chk1',
        'asm_chk2',
        'asm_text7',
        'asm_text8',
        'asm_text9',
        'asm_chk3',
        'asm_chk4',
        'asm_text10',
        'asm_chk5',
        'asm_text11',
        'asm_text12',
        'asm_text13',
      ],
    },
    {
      id: 'lab',
      title: 'Lab',
      style: 'lab-table',
      columns: ['asm_date2', 'asm_date3', 'asm_text36'],
      labRows: [
        { cells: [null, null, 'asm_text28'] },
        { cells: ['asm_text14', 'asm_text21', 'asm_text29'] },
        { cells: ['asm_text15', 'asm_text22', 'asm_text30'] },
        { cells: ['asm_text16', 'asm_text23', 'asm_text31'] },
        { cells: ['asm_text17', 'asm_text24', 'asm_text32'] },
        { cells: ['asm_text18', 'asm_text25', 'asm_text33'] },
        { cells: ['asm_text19', 'asm_text26', 'asm_text34'] },
        { cells: ['asm_text20', 'asm_text27', 'asm_text35'] },
      ],
    },
    {
      id: 'risks',
      title: 'ความเสี่ยงและข้อควรระวัง',
      style: 'risk-blocks',
      riskBlocks: [
        { noColumn: 'asm_chk6', yesColumn: 'asm_chk7', memoColumn: 'asm_memo1' },
        { noColumn: 'asm_chk8', yesColumn: 'asm_chk9', memoColumn: 'asm_memo2' },
        { noColumn: 'asm_chk10', yesColumn: 'asm_chk11', memoColumn: 'asm_memo3' },
        { memoColumn: 'asm_memo4' },
      ],
    },
    {
      id: 'vital',
      title: 'Vital sign',
      style: 'vital-row',
      columns: [
        'asm_text37',
        'asm_text38',
        'asm_text39',
        'asm_text40',
        'asm_text41',
        'asm_text42',
      ],
    },
    {
      id: 'abdominal',
      title: 'Abdominal Examinations',
      style: 'fields',
      columns: [
        'asm_text43',
        'asm_text44',
        'asm_text45',
        'asm_text46',
        'asm_text47',
      ],
    },
    {
      id: 'vaginal',
      title: 'Vaginal Examinations',
      style: 'fields',
      columns: [
        'asm_chk12',
        'asm_chk13',
        'asm_text48',
        'asm_chk14',
        'asm_text49',
        'asm_text50',
        'asm_text51',
        'asm_text52',
        'asm_text53',
        'asm_text54',
      ],
    },
    {
      id: 'appearance',
      title: 'General Appearance',
      style: 'fields',
      columns: ['asm_text55'],
    },
    {
      id: 'current-history',
      title: 'การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร',
      style: 'numbered-risk',
      numberedPairs: [
        { itemNumber: 1, group: 'ประวัติอดีต', noColumn: 'asm_chk15', yesColumn: 'asm_chk16' },
        { itemNumber: 2, group: 'ประวัติอดีต', noColumn: 'asm_chk17', yesColumn: 'asm_chk18' },
        { itemNumber: 3, group: 'ประวัติอดีต', noColumn: 'asm_chk19', yesColumn: 'asm_chk20' },
        { itemNumber: 4, group: 'ประวัติอดีต', noColumn: 'asm_chk21', yesColumn: 'asm_chk22' },
        { itemNumber: 5, group: 'ประวัติอดีต', noColumn: 'asm_chk23', yesColumn: 'asm_chk24' },
        {
          itemNumber: 6,
          group: 'ประวัติอดีต',
          noColumn: 'asm_chk25',
          yesColumn: 'asm_chk26',
          specifyColumn: 'asm_text56',
        },
        { itemNumber: 7, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk27', yesColumn: 'asm_chk28' },
        { itemNumber: 8, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk29', yesColumn: 'asm_chk30' },
        { itemNumber: 9, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk31', yesColumn: 'asm_chk32' },
        { itemNumber: 10, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk33', yesColumn: 'asm_chk34' },
        { itemNumber: 11, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk35', yesColumn: 'asm_chk36' },
        { itemNumber: 12, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk37', yesColumn: 'asm_chk38' },
        { itemNumber: 13, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk39', yesColumn: 'asm_chk40' },
        { itemNumber: 14, group: 'ประวัติปัจจุบัน', noColumn: 'asm_chk41', yesColumn: 'asm_chk42' },
        {
          itemNumber: 15,
          group: 'ประวัติปัจจุบัน',
          noColumn: 'asm_chk43',
          yesColumn: 'asm_chk44',
          specifyColumn: 'asm_text57',
        },
        {
          itemNumber: 16,
          group: 'ประวัติปัจจุบัน',
          noColumn: 'asm_chk45',
          yesColumn: 'asm_chk46',
          specifyColumn: 'asm_text58',
        },
      ],
      numberedSpecifyColumns: ['asm_text61'],
    },
    {
      id: 'problems',
      title: 'Problem Lists',
      style: 'fields',
      columns: ['asm_memo5'],
    },
    {
      id: 'dx',
      title: 'Dx',
      style: 'fields',
      columns: ['asm_text62'],
    },
    {
      id: 'delivery',
      title: 'การคลอด/การวางเด็ก',
      style: 'fields',
      columns: [
        'asm_text63',
        'asm_date4',
        'asm_time2',
        'asm_cbx1',
        'asm_cur1',
        'asm_text64',
        'asm_lk1',
      ],
    },
  ],
};

// ─── LR3 (site numbering) · ระยะคลอด (asm_lr_record_birth_period_nan) ────────

const BIRTH_PERIOD_LAYOUT: AssessmentTimeRowLayout = {
  formKey: 'birth_period',
  dateColumn: 'asm_date1',
  subjectTitle: 'ปรึกษาและสภาพที่พบว่า',
  activityTitle: 'กิจกรรมพยาบาลและการประเมินผล',
  rows: [
    {
      timeColumn: 'asm_time1',
      staffColumn: 'asm_lk1',
      subjectColumns: ['asm_chk2', 'asm_text1', 'asm_chk3', 'asm_chk4', 'asm_text2', 'asm_memo3', 'asm_memo1'],
      activityColumns: [
        'asm_chk15',
        'asm_chk13',
        'asm_text29',
        'asm_chk14',
        'asm_text30',
        'asm_chk16',
        'asm_text31',
        'asm_chk17',
        'asm_chk20',
      ],
    },
    {
      timeColumn: 'asm_time2',
      staffColumn: 'asm_lk2',
      subjectColumns: [
        'asm_text3',
        'asm_chk1',
        'asm_text4',
        'asm_text5',
        'asm_text6',
        'asm_text7',
        'asm_text8',
        'asm_text9',
        'asm_text10',
        'asm_text11',
        'asm_memo2',
      ],
      activityColumns: [
        'asm_chk30',
        'asm_text40',
        'asm_text41',
        'asm_chk23',
        'asm_chk24',
        'asm_chk25',
        'asm_chk26',
        'asm_chk29',
        'asm_chk31',
        'asm_text37',
        'asm_text38',
        'asm_text39',
      ],
    },
    {
      timeColumn: 'asm_time3',
      staffColumn: 'asm_lk3',
      subjectColumns: ['asm_text12', 'asm_text13', 'asm_text14', 'asm_text15'],
      activityColumns: [],
    },
    {
      timeColumn: 'asm_time4',
      staffColumn: 'asm_lk4',
      subjectColumns: ['asm_text42', 'asm_text43', 'asm_text44', 'asm_chk33', 'asm_memo4'],
      activityColumns: ['asm_chk32', 'asm_chk34', 'asm_text45', 'asm_chk36', 'asm_text46', 'asm_memo5'],
    },
    {
      // ประเมิน Blood Loss — 1 หน่วย = 1 หยด — plus the closing observation.
      timeColumn: 'asm_time5',
      staffColumn: 'asm_lk5',
      subjectColumns: [
        'asm_chk5',
        'asm_chk6',
        'asm_text16',
        'asm_text17',
        'asm_chk7',
        'asm_chk8',
        'asm_text18',
        'asm_chk9',
        'asm_chk10',
        'asm_text19',
        'asm_text20',
        'asm_chk11',
        'asm_chk12',
        'asm_text21',
        'asm_text22',
        'asm_text23',
        'asm_text24',
        'asm_text25',
        'asm_text26',
        'asm_text27',
        'asm_text28',
        'asm_text32',
        'asm_text33',
      ],
      activityColumns: ['asm_chk39', 'asm_memo6', 'asm_chk40', 'asm_text47'],
    },
  ],
  footerColumns: ['asm_text50', 'asm_text49', 'asm_text48', 'asm_lk6'],
};

// ─── LR2 (site numbering) · หลังคลอด (asm_lr_record_after_birth_nan) ─────────

const AFTER_BIRTH_LAYOUT: AssessmentTimeRowLayout = {
  formKey: 'after_birth',
  dateColumn: 'asm_date1',
  subjectTitle: 'ปรึกษาและสภาพที่พบว่า',
  activityTitle: 'กิจกรรมพยาบาลและการประเมินผล',
  rows: [
    {
      timeColumn: 'asm_time1',
      staffColumn: 'asm_lk1',
      // รอยแผล Episiotomy / tear + V/S ครั้งที่ 1
      subjectColumns: [
        'asm_chk1',
        'asm_text1',
        'asm_chk2',
        'asm_chk3',
        'asm_chk4',
        'asm_chk5',
        'asm_chk6',
        'asm_text2',
        'asm_text3',
        'asm_text4',
        'asm_text5',
      ],
      activityColumns: [
        'asm_chk13',
        'asm_text18',
        'asm_chk14',
        'asm_text19',
        'asm_memo1',
        'asm_chk16',
        'asm_memo2',
      ],
    },
    {
      timeColumn: 'asm_time2',
      staffColumn: 'asm_lk2',
      // ช่วงที่ 4 ของการคลอด + V/S ครั้งที่ 2
      subjectColumns: [
        'asm_chk7',
        'asm_chk8',
        'asm_memo3',
        'asm_chk9',
        'asm_text6',
        'asm_text7',
        'asm_text8',
        'asm_text9',
      ],
      activityColumns: [
        'asm_chk17',
        'asm_chk18',
        'asm_chk19',
        'asm_text20',
        'asm_chk15',
        'asm_text21',
        'asm_memo4',
      ],
    },
    {
      timeColumn: 'asm_time3',
      staffColumn: 'asm_lk3',
      // V/S ครั้งที่ 3 + การสังเกตหลังคลอดรายวัน
      subjectColumns: ['asm_chk10', 'asm_text10', 'asm_text11', 'asm_text12', 'asm_text13'],
      activityColumns: [
        'asm_chk21',
        'asm_text22',
        'asm_chk22',
        'asm_text23',
        'asm_chk23',
        'asm_text24',
        'asm_chk24',
        'asm_chk25',
        'asm_chk26',
        'asm_chk27',
        'asm_text14',
        'asm_text15',
        'asm_text16',
        'asm_text17',
      ],
    },
    {
      timeColumn: 'asm_time4',
      staffColumn: 'asm_lk4',
      // หลังคลอด 2 ชั่วโมง + คำแนะนำก่อนกลับบ้าน (รวมเวลา Void = asm_time6)
      subjectColumns: ['asm_chk11', 'asm_chk12', 'asm_text25', 'asm_text26'],
      activityColumns: [
        'asm_chk28',
        'asm_chk29',
        'asm_text27',
        'asm_chk30',
        'asm_chk31',
        'asm_chk32',
        'asm_chk33',
        'asm_chk34',
        'asm_chk35',
        'asm_chk36',
        'asm_time6',
        'asm_text28',
        'asm_chk37',
        'asm_chk38',
        'asm_chk39',
        'asm_chk40',
      ],
    },
    {
      timeColumn: 'asm_time5',
      staffColumn: 'asm_lk5',
      subjectColumns: [],
      activityColumns: [],
    },
  ],
  footerColumns: ['asm_text49', 'asm_text50', 'asm_lk6'],
};

const FIELD_LAYOUTS: Readonly<Record<'first_pregnant', AssessmentFormLayout>> = {
  first_pregnant: FIRST_PREGNANT_LAYOUT,
};

const TIME_ROW_LAYOUTS: Readonly<Record<'birth_period' | 'after_birth', AssessmentTimeRowLayout>> = {
  birth_period: BIRTH_PERIOD_LAYOUT,
  after_birth: AFTER_BIRTH_LAYOUT,
};

export function isTimeRowForm(formKey: MaternityAssessmentKey): boolean {
  return formKey !== 'first_pregnant';
}

/** The section layout of the แรกรับ form; undefined for the other two. */
export function fieldLayoutFor(formKey: MaternityAssessmentKey): AssessmentFormLayout | undefined {
  return FIELD_LAYOUTS[formKey as 'first_pregnant'];
}

/** The time-row layout of ระยะคลอด / หลังคลอด; undefined for แรกรับ. */
export function timeRowLayoutFor(formKey: MaternityAssessmentKey): AssessmentTimeRowLayout | undefined {
  return TIME_ROW_LAYOUTS[formKey as 'birth_period' | 'after_birth'];
}
