// Pure presentation helpers for the browser-driven HOSxP sync shown on `/`.
// Moved out of src/app/(provincial)/page.tsx (UI sub-project 2) so the header
// chip, the diagnostic dialog and the copyable report cannot disagree. The
// English status codes stay in the report: IT tickets quote them.
import type { StatusTone } from '@/config/status-tone';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

export type HosxpSyncStatus = 'ERROR' | 'QUERYING' | 'RUNNING' | 'SKIPPED' | 'STARTING';

export const HOSXP_SYNC_STATUS_TH: Record<HosxpSyncStatus, string> = {
  ERROR: 'ผิดพลาด',
  QUERYING: 'กำลังดึงข้อมูล',
  RUNNING: 'ทำงานอยู่',
  SKIPPED: 'ไม่ได้เริ่ม',
  STARTING: 'กำลังเริ่ม',
};

export type HosxpSyncTone = Extract<StatusTone, 'danger' | 'ok' | 'neutral'>;

export function hosxpSyncTone(status: HosxpSyncStatus): HosxpSyncTone {
  if (status === 'ERROR') return 'danger';
  if (status === 'RUNNING' || status === 'QUERYING') return 'ok';
  return 'neutral';
}

export function deriveHosxpSyncStatus(state: OnboardHosxpSyncState | null): HosxpSyncStatus {
  if (state?.error || state?.lastError || state?.phase === 'failed') return 'ERROR';
  if (state?.phase === 'querying_hosxp') return 'QUERYING';
  if (state?.started || state?.alreadyRunning) return 'RUNNING';
  if (state?.ran === false) return 'SKIPPED';
  return 'STARTING';
}

export function describeHosxpSyncDetail(state: OnboardHosxpSyncState | null, status: HosxpSyncStatus): string {
  if (state?.error) return state.error;
  if (state?.lastError) return state.lastError;
  if (status === 'RUNNING' || status === 'QUERYING') {
    return `${state?.phase ?? 'scheduled'} · ${state?.successCount ?? 0}/${state?.cycleCount ?? 0} cycles`;
  }
  if (status === 'SKIPPED') return 'NO BMS SESSION';
  return 'CONNECTING';
}

/** Error code for a tab launched with a BMS session but no marketplace_token:
 *  every sync gate refuses it, so this tab sends nothing to the province. */
export const MISSING_MARKETPLACE_TOKEN = 'missing_marketplace_token';

const HELP_BY_ERROR: Record<string, string> = {
  hospital_not_registered: 'โรงพยาบาลนี้ยังไม่ได้เปิดใช้งานในทะเบียน NN-LRMS',
  missing_bms_session: 'ยังไม่ได้รับ BMS session จาก HOSxP launcher',
  invalid_bms_url: 'BMS URL จาก session ไม่ถูกต้อง',
  [MISSING_MARKETPLACE_TOKEN]:
    'เปิด NN-LRMS โดยไม่ได้รับ marketplace token จาก HOSxP จึงยังไม่ส่งข้อมูลเข้าจังหวัด — ปิดหน้านี้แล้วเปิดใหม่จากเมนู NN-LRMS ใน HOSxP',
};
const HELP_CHECK_LOG = 'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ';

export function describeHosxpSyncHelp(state: OnboardHosxpSyncState | null, status: HosxpSyncStatus): string {
  if (state?.error) return HELP_BY_ERROR[state.error] ?? HELP_CHECK_LOG;
  if (status === 'ERROR') return HELP_CHECK_LOG;
  if (status === 'RUNNING' || status === 'QUERYING') return 'ระบบกำลังดึงข้อมูลจาก HOSxP เป็นรอบอัตโนมัติ';
  return 'ระบบกำลังเริ่มการเชื่อมต่อ HOSxP';
}

export function formatSyncTime(value?: string | null): string {
  if (!value) return 'none yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatCounts(counts?: Record<string, number>): string {
  if (!counts) return '';
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

export function buildHosxpSyncReport(
  state: OnboardHosxpSyncState | null,
  status: string,
  help: string,
): string {
  const lines = [
    'NN-LRMS HOSxP Sync Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `STATUS: ${status}`,
    `PHASE: ${state?.phase ?? 'unknown'}`,
    `HCODE: ${state?.hcode ?? 'unknown'}`,
    `CONNECTION: ${state?.connectionStatus ?? 'unknown'}`,
    `DB TYPE: ${state?.databaseType ?? 'not detected'}`,
    `HELP: ${help}`,
    `LAST CYCLE: ${state?.lastRunAt ?? 'none'}`,
    `LAST SUCCESS: ${state?.lastSuccessAt ?? 'none'}`,
    `LAST ERROR: ${state?.lastErrorAt ?? 'none'} ${state?.lastError ?? ''}`.trim(),
    `NEXT CYCLE: ${state?.nextRunAt ?? 'none'}`,
    `HOSPITAL SYNC: ${state?.hospitalLastSyncAt ?? 'none'}`,
    `CYCLES: ${state?.successCount ?? 0} successful / ${state?.cycleCount ?? 0} attempted`,
    '',
    'Counters:',
    `- IPT local: active=${state?.activePatients ?? 0}, cached=${state?.cachedPatients ?? 0}, latest=${state?.latestPatientSyncedAt ?? 'none'}`,
    `- IPT source: read=${state?.lastStats?.activePatientsRead ?? 0}, synced=${state?.lastStats?.activePatientsSynced ?? 0}`,
    `- ANC local: pregnancies=${state?.activeAncJourneys ?? 0}, latest=${state?.latestAncSyncedAt ?? 'none'}`,
    `- ANC source: read=${state?.lastStats?.anc.sourcePatientsRead ?? 0}, mapped=${state?.lastStats?.anc.sourcePatientsMapped ?? 0}, synced=${state?.lastStats?.anc.patientsSynced ?? 0}`,
    `- ANC visits: read=${state?.lastStats?.anc.servicesRead ?? 0}, mapped=${state?.lastStats?.anc.servicesMapped ?? 0}`,
    `- ANC risk: risk=${state?.lastStats?.anc.risksMapped ?? 0}, classifying=${state?.lastStats?.anc.classifyingMapped ?? 0}`,
    `- Partograph: read=${state?.lastStats?.partographRowsRead ?? 0}, upserted=${state?.lastStats?.partographRowsUpserted ?? 0}`,
    `- Referrals: active=${state?.activeReferrals ?? 0}, outgoing=${state?.outgoingReferrals ?? 0}, incoming=${state?.incomingReferrals ?? 0}`,
  ];

  if (state?.error || state?.detail || state?.lastError || state?.lastStats?.anc.error) {
    lines.push(
      '',
      'Errors:',
      `- error=${state?.error ?? 'none'}`,
      `- detail=${state?.detail ?? 'none'}`,
      `- lastError=${state?.lastError ?? 'none'}`,
      `- ancError=${state?.lastStats?.anc.error ?? 'none'}`,
      `- ancSkipped=${state?.lastStats?.anc.skippedReason ?? 'none'}`,
    );
  }

  lines.push('', 'Step log:');
  const steps = state?.lastSteps ?? [];
  if (steps.length === 0) {
    lines.push('- no step log recorded yet');
  } else {
    for (const step of steps) {
      const counts = formatCounts(step.counts);
      lines.push(
        `- [${step.at}] cycle=${step.cycle} ${step.status.toUpperCase()} ${step.name}: ${step.message}${counts ? ` (${counts})` : ''}${step.detail ? ` | ${step.detail}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
