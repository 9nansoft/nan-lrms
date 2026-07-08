// ANC clinical decision rules — centralized so the journey detail page (and any
// future ANC surface) share one source of truth for vital-sign severity bands,
// the WHO 8-contact schedule, pre-pregnancy BMI, and RTCOG OB 66-029 (2566)
// investigation-timing checks. Ported verbatim from the detail page; pinned by
// tests/unit/services/anc-clinical.test.ts.

// ─── Vital-sign severity bands ───────────────────────────────────────────────

export const BP_SYS_HIGH = 140;
export const BP_SYS_AMBER = 130; // 130-139 = borderline/elevated
export const BP_DIA_HIGH = 90;
export const BP_DIA_AMBER = 85; // 85-89 = borderline
export const FHR_LOW = 110;
export const FHR_HIGH = 160;
export const HB_LOW = 11; // anemia
export const HB_SEVERE = 9; // severe anemia

export type Severity = 'normal' | 'borderline' | 'abnormal';

export function sevBp(sys: number | null, dia: number | null): Severity {
  if (sys == null || dia == null) return 'normal';
  if (sys >= BP_SYS_HIGH || dia >= BP_DIA_HIGH) return 'abnormal';
  if (sys >= BP_SYS_AMBER || dia >= BP_DIA_AMBER) return 'borderline';
  return 'normal';
}

export function sevFhr(v: number | null): Severity {
  if (v == null) return 'normal';
  if (v < FHR_LOW || v > FHR_HIGH) return 'abnormal';
  return 'normal';
}

export function sevHb(v: number | null): Severity {
  if (v == null) return 'normal';
  if (v < HB_SEVERE) return 'abnormal';
  if (v < HB_LOW) return 'borderline';
  return 'normal';
}

// ─── WHO 8-contact ANC schedule ──────────────────────────────────────────────

// WHO 2016 recommended 8-contact ANC schedule — target gestational weeks.
// First contact < 12w; then 20/26/30/34/36/38/40. See NBK409109.
export const WHO_CONTACT_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40];
export const WHO_CONTACT_WINDOW_W = 1; // ±1w counts as "attended".

export interface NextWhoContact {
  ga: number;
  status: 'overdue' | 'due-now' | 'upcoming';
  weeksAway: number;
}

// Compute the next WHO contact-week that hasn't been attended, together
// with whether it's overdue / due-now / upcoming.
export function nextContactDue(
  currentGa: number | null,
  attendedWeeks: number[],
): NextWhoContact | null {
  if (currentGa == null) return null;
  for (const w of WHO_CONTACT_WEEKS) {
    const attended = attendedWeeks.some((v) => Math.abs(v - w) <= WHO_CONTACT_WINDOW_W);
    if (attended) continue;
    const diff = w - currentGa;
    if (diff < -WHO_CONTACT_WINDOW_W) {
      return { ga: w, status: 'overdue', weeksAway: diff };
    }
    if (Math.abs(diff) <= WHO_CONTACT_WINDOW_W) {
      return { ga: w, status: 'due-now', weeksAway: diff };
    }
    return { ga: w, status: 'upcoming', weeksAway: diff };
  }
  return null;
}

// ─── Pre-pregnancy BMI ───────────────────────────────────────────────────────

// Clinical BMI = kg / (m*m), rounded to one decimal. Only meaningful with a
// plausible height (labor record) and the earliest recorded visit weight.
export function prePregnancyBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (heightCm && heightCm > 100 && weightKg && weightKg > 0) {
    const m = heightCm / 100;
    return Math.round((weightKg / (m * m)) * 10) / 10;
  }
  return null;
}

// ─── RTCOG OB 66-029 (2566) timing rules ─────────────────────────────────────

// RTCOG OB 66-029 (2566) recommends first ANC contact < 10w. Tightened from
// 12w (WHO threshold) because the Thai guideline is stricter.
export function isLateFirstContact(firstVisitGa: number | null): boolean {
  return firstVisitGa != null && firstVisitGa >= 10;
}

export interface OverdueInvestigation {
  key: string;
  labelTh: string;
  dueBy: string;
  severity: 'warn' | 'high';
}

export interface OverdueInvestigationInput {
  gaWeeks: number | null;
  anatomyScanDate: string | null | undefined;
  ogttResult: string | null | undefined;
  gbsResult: string | null | undefined;
  /** Whether Tdap was given in any visit this pregnancy. */
  tdapGiven: boolean;
  // Thalassemia screen is "done" if any of these is present.
  mcvFl: number | null | undefined;
  dcipResult: string | null | undefined;
  hbEResult: string | null | undefined;
}

// RTCOG OB 66-029 (2566) — investigation-overdue checks. Each fires when the
// clinical window has passed without the corresponding result.
export function overdueInvestigations(input: OverdueInvestigationInput): OverdueInvestigation[] {
  const ga = input.gaWeeks ?? 0;
  const overdue: OverdueInvestigation[] = [];
  if (ga > 22 && !input.anatomyScanDate) {
    overdue.push({
      key: 'anatomy_scan',
      labelTh: 'Anatomy scan (18-22 สัปดาห์)',
      dueBy: '22w',
      severity: 'warn',
    });
  }
  if (ga > 30 && (input.ogttResult == null || input.ogttResult === 'PENDING')) {
    overdue.push({
      key: 'ogtt',
      labelTh: 'OGTT (24-28 สัปดาห์)',
      dueBy: '28w',
      severity: 'high',
    });
  }
  if (ga >= 37 && (!input.gbsResult || input.gbsResult === 'PENDING')) {
    overdue.push({
      key: 'gbs',
      labelTh: 'GBS culture (35-37 สัปดาห์)',
      dueBy: '37w',
      severity: 'high',
    });
  }
  if (ga >= 36 && !input.tdapGiven) {
    overdue.push({
      key: 'tdap',
      labelTh: 'Tdap (27-36 สัปดาห์)',
      dueBy: '36w',
      severity: 'high',
    });
  }
  // Thalassemia screening — once per woman. If any of the three fields is
  // still null by GA 16, flag it.
  const thalassemiaDone =
    input.mcvFl != null || input.dcipResult != null || input.hbEResult != null;
  if (ga > 16 && !thalassemiaDone) {
    overdue.push({
      key: 'thalassemia',
      labelTh: 'Thalassemia screen (1st visit)',
      dueBy: '16w',
      severity: 'warn',
    });
  }
  return overdue;
}
