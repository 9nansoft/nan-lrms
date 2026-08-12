// Statistics-mode context builder — the deterministic aggregate block injected
// into the dashboard chatbot's prompt.
//
// SCOPE: the main dashboard is PROVINCE-WIDE, so this builder is too. The
// session's hcode only adds a "your hospital" section on top; a user without a
// resolvable hospital (provincial/central) still gets the full province view.
//
// PROVENANCE (count-provenance rule): every number here comes from the SAME
// service functions that render the dashboard — getProvinceDashboard() and
// getStageKPIs() — so the bot can never quote a figure that disagrees with the
// screen the user is looking at. Do NOT hand-roll parallel COUNT SQL here.
//
// PDPA: aggregates only. This builder must never touch name/cid/cid_hash/hn —
// unlike clinical mode it does not decrypt anything.
import type { DatabaseAdapter } from '@/db/adapter';
import { getProvinceDashboard, getStageKPIs } from '@/services/dashboard';
import { formatBangkokStamp } from '@/lib/bangkok-time';
import { clinicalChatStatsLimits } from '@/config/clinical-chat-config';

/** One hospital's labor-floor line in the per-hospital breakdown. */
export interface StatisticsHospitalRow {
  hcode: string;
  name: string;
  inLabor: number;
  high: number;
  medium: number;
  low: number;
  ancTotal: number;
  ancHr3: number;
}

export interface StatisticsSnapshot {
  /** labor_status = 'ACTIVE' province-wide — the literal answer to
   *  "ตอนนี้มีคนรอคลอดกี่คน". Same figure as the dashboard's headline card. */
  inLabor: number;
  inLaborHigh: number;
  inLaborMedium: number;
  inLaborLow: number;
  /** Subset of `inLabor` that already has a CPD score (the 3-stage card's
   *  "ในห้องคลอด" total). Equal to inLabor unless scoring lags. */
  inLaborWithCpd: number;
  ancTotal: number;
  ancLow: number;
  ancHr1: number;
  ancHr2: number;
  ancHr3: number;
  deliveredThisMonth: number;
  deliveredNormal: number;
  deliveredLowApgar: number;
  deliveredLbw: number;
  pendingReferralsProvince: number;
  hospitals: StatisticsHospitalRow[];
}

export interface StatisticsContext {
  /** Session hcode when it resolves to an ACTIVE hospital, else null. */
  hospitalCode: string | null;
  hospitalName: string | null;
  /** Convenience mirror of snapshot.inLabor (the most-asked number). */
  provinceInLabor: number;
  generatedAt: string;
  snapshot: StatisticsSnapshot;
  /** Rendered Thai markdown block for the prompt. */
  context: string;
}

/**
 * Builds the dashboard-aligned statistics block.
 *
 * @param hospitalCode the SESSION's 5-digit hcode (session.user.hospitalCode) —
 *   NOT the internal hospitals.id. Passing the id here was the 2026-08-06 bug
 *   that made the bot answer "ไม่มีข้อมูล" to every statistics question.
 *
 * Never returns null: an unknown/absent hcode degrades to province scope so the
 * dashboard bot always has numbers to answer from.
 */
export async function buildStatisticsContext(
  db: DatabaseAdapter,
  hospitalCode?: string | null,
): Promise<StatisticsContext> {
  const limits = clinicalChatStatsLimits();
  const [dash, stage, pendingReferrals, ownScoped] = await Promise.all([
    getProvinceDashboard(db),
    getStageKPIs(db),
    countPendingReferralsProvince(db),
    hospitalCode ? countHospitalScoped(db, hospitalCode) : Promise.resolve(null),
  ]);

  const own = hospitalCode ? (dash.hospitals.find((h) => h.hcode === hospitalCode) ?? null) : null;

  const hospitals: StatisticsHospitalRow[] = dash.hospitals
    .filter((h) => h.counts.total > 0)
    .sort((a, b) => b.counts.total - a.counts.total)
    .map((h) => ({
      hcode: h.hcode,
      name: h.name,
      inLabor: h.counts.total,
      high: h.counts.high,
      medium: h.counts.medium,
      low: h.counts.low,
      ancTotal: h.ancCounts.total,
      ancHr3: h.ancCounts.hr3,
    }));

  const snapshot: StatisticsSnapshot = {
    inLabor: dash.summary.totalActive,
    inLaborHigh: dash.summary.totalHigh,
    inLaborMedium: dash.summary.totalMedium,
    inLaborLow: dash.summary.totalLow,
    inLaborWithCpd: stage.labor.total,
    ancTotal: stage.pregnancy.total,
    ancLow: stage.pregnancy.low,
    ancHr1: stage.pregnancy.hr1,
    ancHr2: stage.pregnancy.hr2,
    ancHr3: stage.pregnancy.hr3,
    deliveredThisMonth: stage.delivered.total,
    deliveredNormal: stage.delivered.normal,
    deliveredLowApgar: stage.delivered.lowApgar,
    deliveredLbw: stage.delivered.lbw,
    pendingReferralsProvince: pendingReferrals,
    hospitals,
  };

  const generatedAt = new Date().toISOString();
  const context = renderStatisticsBlock({
    snapshot,
    stamp: formatBangkokStamp(new Date(generatedAt)),
    own: own ? { hcode: own.hcode, name: own.name } : null,
    ownScoped,
    hospitalLimit: limits.hospitalBreakdownLimit,
  });

  return {
    hospitalCode: own ? own.hcode : null,
    hospitalName: own ? own.name : null,
    provinceInLabor: snapshot.inLabor,
    generatedAt,
    snapshot,
    context,
  };
}

interface HospitalScopedCounts {
  pendingReferralsIn: number;
  pendingAlerts: number;
}

/** Hospital-scoped extras, resolved BY HCODE (join on hospitals.hcode) — the
 *  session never carries hospitals.id. */
async function countHospitalScoped(
  db: DatabaseAdapter,
  hcode: string,
): Promise<HospitalScopedCounts> {
  const [referrals, alerts] = await Promise.all([
    db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM cached_referrals r
       JOIN hospitals h ON h.id = r.to_hospital_id
       WHERE h.hcode = ? AND r.status IN ('INITIATED','ACCEPTED','IN_TRANSIT')`,
      [hcode],
    ),
    db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM moph_alert_log a
       JOIN hospitals h ON h.id = a.hospital_id
       WHERE h.hcode = ? AND a.status = 'pending'`,
      [hcode],
    ),
  ]);
  return {
    pendingReferralsIn: Number(referrals[0]?.c ?? 0),
    pendingAlerts: Number(alerts[0]?.c ?? 0),
  };
}

async function countPendingReferralsProvince(db: DatabaseAdapter): Promise<number> {
  const rows = await db.query<{ c: number }>(
    `SELECT COUNT(*) AS c FROM cached_referrals r
     JOIN hospitals h ON h.id = r.to_hospital_id
     WHERE h.is_active = true AND r.status IN ('INITIATED','ACCEPTED','IN_TRANSIT')`,
  );
  return Number(rows[0]?.c ?? 0);
}

/**
 * Renders the prompt block. Deliberately synonym-rich on the labor line
 * (รอคลอด / กำลังคลอด / ในห้องคลอด / ACTIVE) so a Thai question phrased any of
 * those ways maps onto the same figure without prompt-side keyword rules.
 */
function renderStatisticsBlock(input: {
  snapshot: StatisticsSnapshot;
  stamp: string;
  own: { hcode: string; name: string } | null;
  ownScoped: HospitalScopedCounts | null;
  hospitalLimit: number;
}): string {
  const { snapshot: s, stamp, own, ownScoped, hospitalLimit } = input;
  const shown = s.hospitals.slice(0, hospitalLimit);
  const lines: string[] = [];

  lines.push(`## ข้อมูลสถิติจริงจากแดชบอร์ด NN-LRMS (ข้อมูล ณ ${stamp})`);
  lines.push('');
  lines.push('### ภาพรวมทั้งจังหวัด');
  lines.push(
    `- ผู้ป่วย**รอคลอด**ขณะนี้ (กำลังคลอด / อยู่ในห้องคลอด / labor_status = ACTIVE): ` +
      `**${s.inLabor}** คน`,
  );
  lines.push(
    `  - แยกตามความเสี่ยง CPD: เสี่ยงสูง ${s.inLaborHigh} · เสี่ยงปานกลาง ${s.inLaborMedium} · ` +
      `เสี่ยงต่ำ ${s.inLaborLow}`,
  );
  if (s.inLaborWithCpd !== s.inLabor) {
    lines.push(
      `  - หมายเหตุ: ประเมิน CPD แล้ว ${s.inLaborWithCpd} คน จาก ${s.inLabor} คน ` +
        `(ผู้ที่ยังไม่มีคะแนน CPD จะไม่ถูกนับในกลุ่มเสี่ยงข้างต้น)`,
    );
  }
  lines.push(
    `- ANC กำลังติดตาม (ตั้งครรภ์ ยังไม่คลอด): **${s.ancTotal}** ราย — ` +
      `LOW ${s.ancLow} · HR1 ${s.ancHr1} · HR2 ${s.ancHr2} · HR3 ${s.ancHr3}`,
  );
  lines.push(
    `- คลอดแล้วเดือนนี้: **${s.deliveredThisMonth}** ราย — ปกติ ${s.deliveredNormal} · ` +
      `APGAR ต่ำ ${s.deliveredLowApgar} · น้ำหนักแรกเกิดน้อย ${s.deliveredLbw}`,
  );
  lines.push(
    `- การส่งต่อค้าง (รอรับ/ตอบรับ/ระหว่างทาง) ทั้งจังหวัด: **${s.pendingReferralsProvince}** ราย`,
  );
  lines.push('');

  lines.push(
    `### ผู้รอคลอดแยกรายโรงพยาบาล (${shown.length} จาก ${s.hospitals.length} รพ. ที่มีผู้รอคลอดขณะนี้)`,
  );
  if (shown.length === 0) {
    lines.push('- ขณะนี้ไม่มีผู้รอคลอดในโรงพยาบาลใดเลย');
  } else {
    lines.push('| โรงพยาบาล | รหัส | รอคลอด | เสี่ยงสูง | ANC ติดตาม |');
    lines.push('|---|---|---|---|---|');
    for (const h of shown) {
      lines.push(`| ${h.name} | ${h.hcode} | ${h.inLabor} | ${h.high} | ${h.ancTotal} |`);
    }
    if (s.hospitals.length > shown.length) {
      lines.push(
        `- (แสดงเฉพาะ ${shown.length} อันดับแรก — ยอดรวมทั้งจังหวัด ${s.inLabor} คน คือตัวเลขที่ถูกต้อง)`,
      );
    }
  }
  lines.push('');

  if (own) {
    lines.push(`### โรงพยาบาลของผู้ใช้: ${own.name} (รหัส ${own.hcode})`);
    const mine = s.hospitals.find((h) => h.hcode === own.hcode);
    lines.push(`- รอคลอดขณะนี้: **${mine?.inLabor ?? 0}** คน (เสี่ยงสูง ${mine?.high ?? 0})`);
    lines.push(`- ANC กำลังติดตาม: ${mine?.ancTotal ?? 0} ราย (HR3 ${mine?.ancHr3 ?? 0})`);
    if (ownScoped) {
      lines.push(`- ส่งต่อเข้ามาค้างอยู่: ${ownScoped.pendingReferralsIn} ราย`);
      lines.push(`- แจ้งเตือน MOPH ค้างส่ง: ${ownScoped.pendingAlerts} ราย`);
    }
    lines.push('');
  }

  lines.push(
    '(ทุกตัวเลขเป็นยอดรวม ไม่ระบุตัวผู้ป่วย และตรงกับที่แสดงบนหน้าแดชบอร์ด — ' +
      'หากคำถามต้องการตัวเลขที่ไม่มีในบล็อกนี้ ให้บอกว่ายังไม่มีข้อมูล)',
  );
  return lines.join('\n');
}
