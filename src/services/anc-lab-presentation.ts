/**
 * What the journey lab panel may say about a result. Pure, so it runs in the
 * browser and every display rule stays in one place.
 *
 * A result is only abnormal when HOSxP or the normaliser says so; no numeric
 * threshold is applied here. Anything that cannot be read stays visibly
 * unreadable, so it cannot pass for no result or for a normal one.
 */
import {
  ANC_LAB_ABNORMAL_FLAG_VALUE,
  ANC_LAB_EARLIER_POSITIVE_STATE,
  ANC_LAB_CORE_ITEMS,
  ANC_LAB_NEGATIVE_IS_NOTABLE,
  ANC_LAB_PANEL_GROUPS,
  ANC_LAB_RH_FORM_NOTE,
  ANC_LAB_SEROLOGY_WITHHELD_LABEL,
  ANC_LAB_TEST_LABEL,
  ANC_LAB_TREND_TESTS,
} from '@/config/anc-lab-display';
import {
  ANC_LAB_RH_FORM_WORD_NOTE,
  ANC_LAB_STICKY_POSITIVE_TESTS,
  type AncLabTest,
} from '@/config/anc-lab-canon';
import { interpretStoredResult, testNamedBy } from '@/services/anc-lab-classifier';
import type { JourneyLabResult } from '@/services/anc-lab-results';

export type LabTone = 'abnormal' | 'normal' | 'neutral' | 'concealed' | 'unreadable' | 'none';

export interface LabPresentation {
  tone: LabTone;
  value: string | null;
  stateLabel: string | null;
  contextUnreadable: boolean;
  /** HOSxP flagged it abnormal; for unclassified rows this is words, not colour. */
  hosxpFlagged: boolean;
  /** A caution to print with the result, or null. */
  note: string | null;
}

export interface LabTestSummary {
  test: AncLabTest;
  labelTh: string;
  latest: JourneyLabResult;
  older: JourneyLabResult[];
  /** Most recent positive before a non-positive latest. Awaiting obstetric sign-off. */
  earlierPositive: JourneyLabResult | null;
}

export interface LabTrend {
  test: AncLabTest;
  labelTh: string;
  unit: string | null;
  points: { date: string; value: number }[];
}

export interface JourneyLabPanelModel {
  groups: { id: string; titleTh: string; tests: LabTestSummary[] }[];
  trends: LabTrend[];
  other: JourneyLabResult[];
  missing: { id: string; labelTh: string }[];
  sources: { hospitalName: string; lastSyncedAt: string }[];
}

const UNREADABLE_LABEL = 'อ่านข้อมูลไม่ได้';
const ABNORMAL_LABEL = 'ผิดปกติ';

/**
 * Status for a journey tile holding a code. Only the exact normal code may be
 * green: these columns can hold PENDING or free text from person_anc.
 */
export function codedTileStatus(
  value: string | null | undefined,
  normalCode: string,
  abnormalCode: string,
): 'missing' | 'normal' | 'abnormal' | 'neutral' {
  if (!value) return 'missing';
  if (value === abnormalCode) return 'abnormal';
  return value === normalCode ? 'normal' : 'neutral';
}

/**
 * For columns that hold person_anc free text rather than a code (hiv_result,
 * vdrl_result). Uses the same reading as the lab results, so exact codes work
 * too. Anything it cannot read stays neutral: a VDRL titer such as 1:8 needs a
 * clinician, and no threshold is applied here.
 */
export function serologyTextTileStatus(
  value: string | null | undefined,
  test: AncLabTest,
): 'missing' | 'normal' | 'abnormal' | 'neutral' {
  if (!value) return 'missing';
  const { interpretation } = interpretStoredResult(test, value);
  if (interpretation === 'positive' || interpretation === 'abnormal') return 'abnormal';
  return interpretation === 'negative' ? 'normal' : 'neutral';
}

/** Everything a journey tile needs for HIV or VDRL, whether or not it is withheld. */
export function serologyTile(
  value: string | null | undefined,
  test: AncLabTest,
  withheld: boolean | undefined,
): {
  value: string | null;
  status: 'missing' | 'normal' | 'abnormal' | 'neutral' | 'concealed';
  statusLabel: string | null;
} {
  if (withheld) {
    return { value: null, status: 'concealed', statusLabel: ANC_LAB_SEROLOGY_WITHHELD_LABEL };
  }
  return {
    value: value ?? null,
    status: serologyTextTileStatus(value, test),
    statusLabel: null,
  };
}

function isMissing(r: JourneyLabResult): boolean {
  return r.interpretation === 'missing' && !r.concealed && !r.rawResultUnreadable;
}

function statesAbnormal(r: JourneyLabResult, flagged: boolean): boolean {
  if (flagged) return true;
  if (r.canonicalTest && ANC_LAB_NEGATIVE_IS_NOTABLE.includes(r.canonicalTest)) {
    return r.interpretation === 'negative';
  }
  return r.interpretation === 'positive' || r.interpretation === 'abnormal';
}

function statesNormal(r: JourneyLabResult): boolean {
  if (r.canonicalTest && ANC_LAB_NEGATIVE_IS_NOTABLE.includes(r.canonicalTest)) {
    return r.interpretation === 'positive';
  }
  return r.interpretation === 'negative';
}

function valueOf(r: JourneyLabResult): string | null {
  if (r.numericValue !== null) return String(r.numericValue);
  return r.normalizedValue ?? r.rawResult;
}

export function presentLabResult(
  r: JourneyLabResult,
  options: { earlierPositive?: boolean } = {},
): LabPresentation {
  const hosxpFlagged = r.abnormalFlag?.trim().toUpperCase() === ANC_LAB_ABNORMAL_FLAG_VALUE;
  const base = {
    contextUnreadable: r.contextUnreadable,
    hosxpFlagged,
    note: r.classificationNote === ANC_LAB_RH_FORM_WORD_NOTE ? ANC_LAB_RH_FORM_NOTE : null,
  };
  if (r.concealed) return { ...base, tone: 'concealed', value: null, stateLabel: 'ปกปิดผล' };
  if (r.rawResultUnreadable) {
    return { ...base, tone: 'unreadable', value: null, stateLabel: UNREADABLE_LABEL };
  }
  if (isMissing(r)) return { ...base, tone: 'none', value: null, stateLabel: 'ไม่มีผล' };

  const value = valueOf(r);
  if (r.canonicalTest === null) {
    return r.contextUnreadable
      ? { ...base, tone: 'unreadable', value, stateLabel: UNREADABLE_LABEL }
      : { ...base, tone: 'neutral', value, stateLabel: null };
  }
  if (statesAbnormal(r, hosxpFlagged)) {
    return {
      ...base,
      tone: 'abnormal',
      value,
      stateLabel: value === ABNORMAL_LABEL ? null : ABNORMAL_LABEL,
    };
  }
  if (r.contextUnreadable) {
    return { ...base, tone: 'unreadable', value, stateLabel: UNREADABLE_LABEL };
  }
  // Awaiting obstetric sign-off: see ANC_LAB_STICKY_POSITIVE_TESTS.
  if (options.earlierPositive) {
    return { ...base, tone: 'neutral', value, stateLabel: ANC_LAB_EARLIER_POSITIVE_STATE };
  }
  return { ...base, tone: statesNormal(r) ? 'normal' : 'neutral', value, stateLabel: null };
}

function summariseTest(test: AncLabTest, rows: JourneyLabResult[]): LabTestSummary {
  const onFile = rows.filter((r) => !isMissing(r));
  const [latest, ...older] = onFile.length > 0 ? onFile : rows.slice(0, 1);
  const earlierPositive =
    ANC_LAB_STICKY_POSITIVE_TESTS.includes(test) && latest.interpretation !== 'positive'
      ? (older.find((r) => r.interpretation === 'positive') ?? null)
      : null;
  return { test, labelTh: ANC_LAB_TEST_LABEL[test], latest, older, earlierPositive };
}

function trendOf(test: AncLabTest, rows: JourneyLabResult[]): LabTrend | null {
  const usable = rows.filter(
    (r): r is JourneyLabResult & { resultDate: string; numericValue: number } =>
      r.resultDate !== null && r.numericValue !== null && !r.concealed && !r.rawResultUnreadable,
  );
  if (usable.length < 2) return null;
  return {
    test,
    labelTh: ANC_LAB_TEST_LABEL[test],
    unit: usable.find((r) => r.unit)?.unit ?? null,
    points: usable.map((r) => ({ date: r.resultDate, value: r.numericValue })).reverse(),
  };
}

function latestSyncPerHospital(results: JourneyLabResult[]): JourneyLabPanelModel['sources'] {
  const byHospital = new Map<string, { hospitalName: string; lastSyncedAt: string }>();
  for (const r of results) {
    const seen = byHospital.get(r.hospitalId);
    if (!seen || r.syncedAt > seen.lastSyncedAt) {
      byHospital.set(r.hospitalId, { hospitalName: r.hospitalName, lastSyncedAt: r.syncedAt });
    }
  }
  return [...byHospital.values()];
}

/** `results` must be newest first, as listJourneyLabResults returns them. */
export function buildJourneyLabPanel(results: JourneyLabResult[]): JourneyLabPanelModel {
  const byTest = new Map<AncLabTest, JourneyLabResult[]>();
  const other: JourneyLabResult[] = [];
  for (const r of results) {
    if (r.canonicalTest === null) other.push(r);
    else byTest.set(r.canonicalTest, [...(byTest.get(r.canonicalTest) ?? []), r]);
  }

  // A row named for the test but failing its shape check is under "other", with
  // a warning. The result exists, so it must not also be listed as absent.
  const namedOnly = new Set(
    results.filter((r) => r.classificationNote === 'value_shape_mismatch').map(testNamedBy),
  );

  return {
    groups: ANC_LAB_PANEL_GROUPS.map((group) => ({
      id: group.id,
      titleTh: group.titleTh,
      tests: group.tests.flatMap((test) => {
        const rows = byTest.get(test);
        return rows ? [summariseTest(test, rows)] : [];
      }),
    })).filter((group) => group.tests.length > 0),
    trends: ANC_LAB_TREND_TESTS.flatMap((test) => {
      const trend = trendOf(test, byTest.get(test) ?? []);
      return trend ? [trend] : [];
    }),
    other,
    missing: ANC_LAB_CORE_ITEMS.filter(
      (item) =>
        !item.tests.some(
          (test) => namedOnly.has(test) || byTest.get(test)?.some((r) => !isMissing(r)),
        ),
    ).map(({ id, labelTh }) => ({ id, labelTh })),
    sources: latestSyncPerHospital(results),
  };
}
