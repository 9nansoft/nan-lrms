// Hospital connection/sync vocabulary — the ONE place that turns a hospital's
// connection_status + sync_status into words and tones (UI sub-project 4,
// spec L5/L6). Light mode is Thai. The kiosk keeps its frozen English copy
// (UI sub-project 2, decision 6); those strings live here VERBATIM so no
// component carries copy. Client-safe: no env, no server imports.
import { ConnectionStatus } from '@/types/domain';
import { SYNC_HEALTH, type SyncHealthClass } from '@/config/hospital-network';

export type HospitalLinkStatus = 'online' | 'blocked' | 'offline' | 'noSync' | 'unknown';
import type { StatusTone as BaseStatusTone } from '@/config/status-tone';

/** The hospital-link vocabulary has no brand tone: the shared StatusTone
 *  minus 'brand' (single source: src/config/status-tone.ts). */
export type HospitalStatusTone = Exclude<BaseStatusTone, 'brand'>;

/** Same precedence as the inline chains it replaces (map pin dot, map
 *  tooltip, HospitalTable badge): BLOCKED wins over a live tunnel, and a
 *  tunnel that is up but has never synced is not "online". */
export function classifyHospitalLink(
  connectionStatus: string | null | undefined,
  syncStatus: string | null | undefined,
): HospitalLinkStatus {
  if (syncStatus === 'BLOCKED') return 'blocked';
  const neverSynced = syncStatus === 'NEVER_SYNCED';
  if (connectionStatus === ConnectionStatus.ONLINE && !neverSynced) return 'online';
  if (connectionStatus === ConnectionStatus.OFFLINE) return 'offline';
  if (neverSynced) return 'noSync';
  return 'unknown';
}

export interface HospitalLinkMeta {
  labelTh: string;
  detailTh: string;
  tone: HospitalStatusTone;
  /** Frozen kiosk / legacy badge word — do not translate. */
  kioskLabel: string;
}

export const HOSPITAL_LINK_STATUS: Record<HospitalLinkStatus, HospitalLinkMeta> = {
  online: { labelTh: 'ออนไลน์', detailTh: 'เชื่อมต่อและซิงค์ข้อมูลปกติ', tone: 'ok', kioskLabel: 'ONLINE' },
  blocked: { labelTh: 'ระงับการซิงค์', detailTh: 'ระบบระงับการซิงค์ของโรงพยาบาลนี้', tone: 'warn', kioskLabel: 'BLOCKED' },
  offline: { labelTh: 'ออฟไลน์', detailTh: 'ติดต่อตู้ BMS ของโรงพยาบาลไม่ได้', tone: 'danger', kioskLabel: 'OFFLINE' },
  noSync: {
    labelTh: 'ยังไม่เคยซิงค์',
    detailTh: 'รอผู้ใช้จากโรงพยาบาลนี้เปิด NN-LRMS ครั้งแรก',
    tone: 'neutral',
    kioskLabel: 'NO SYNC',
  },
  unknown: { labelTh: 'ไม่ทราบ', detailTh: 'ยังไม่ทราบสถานะการเชื่อมต่อ', tone: 'neutral', kioskLabel: 'UNKNOWN' },
};

/** Light-mode label + detail (Thai). Blocked appends the server's reason. */
export function hospitalLinkText(
  status: HospitalLinkStatus,
  blockedReason?: string | null,
): { label: string; detail: string } {
  const m = HOSPITAL_LINK_STATUS[status];
  const detail = status === 'blocked' ? `${m.detailTh} — ${blockedReason ?? 'ไม่ทราบสาเหตุ'}` : m.detailTh;
  return { label: m.labelTh, detail };
}

/** Frozen kiosk / legacy strings, each with ITS OWN legacy precedence (the
 *  pin title and tooltip detail check never-synced before the connection).
 *  Byte-identical to ProvinceMapLeaflet / HospitalTable before UI
 *  sub-project 4 — do not "fix" the precedence here. */
export function kioskLinkText(
  connectionStatus: string | null | undefined,
  syncStatus: string | null | undefined,
  blockedReason?: string | null,
): { label: string; detail: string; pinTitle: string; tableTitle: string } {
  const isBlocked = syncStatus === 'BLOCKED';
  const isNever = syncStatus === 'NEVER_SYNCED';
  const label = HOSPITAL_LINK_STATUS[classifyHospitalLink(connectionStatus, syncStatus)].kioskLabel;
  const detail = isBlocked
    ? `Sync ถูกระงับ — ${blockedReason ?? 'unknown'}`
    : isNever
      ? 'ยังไม่เคยเชื่อม sync'
      : connectionStatus === 'OFFLINE'
        ? 'ติดต่อตู้ BMS ไม่ได้'
        : connectionStatus === 'ONLINE'
          ? 'sync ปกติ'
          : 'ยังไม่ทราบสถานะ';
  const pinTitle = isBlocked
    ? `Sync ถูกระงับ — ${blockedReason ?? 'unknown'}`
    : isNever
      ? 'ยังไม่เคยมีการเชื่อมต่อ Sync'
      : connectionStatus === 'ONLINE'
        ? 'Online'
        : connectionStatus === 'OFFLINE'
          ? 'Offline'
          : 'Unknown';
  const tableTitle = isBlocked
    ? `Sync ถูกระงับ — ${blockedReason ?? 'unknown reason'}`
    : isNever
      ? 'ยังไม่เคยมีการเชื่อมต่อ Sync — รอผู้ใช้จากโรงพยาบาลนี้เปิด NN-LRMS ครั้งแรก'
      : '';
  return { label, detail, pinTitle, tableTitle };
}

/** Data-freshness words (classifySyncHealth). Shared states reuse the link
 *  words so "blocked" / "never synced" read the same on every screen. */
export const SYNC_HEALTH_TH: Record<SyncHealthClass, string> = {
  ok: 'ข้อมูลสด',
  stale: `ล่าช้าเกิน ${SYNC_HEALTH.staleAfterMinutes} นาที`,
  critical: `ล่าช้าเกิน ${SYNC_HEALTH.criticalAfterHours} ชม.`,
  never: HOSPITAL_LINK_STATUS.noSync.labelTh,
  blocked: HOSPITAL_LINK_STATUS.blocked.labelTh,
};

/** Connection-only words (ConnectionStatus, ConnectionSummary,
 *  InactiveHospitalList) — the same words as the link vocabulary. */
export const CONNECTION_LABEL_TH: Record<ConnectionStatus, string> = {
  [ConnectionStatus.ONLINE]: HOSPITAL_LINK_STATUS.online.labelTh,
  [ConnectionStatus.OFFLINE]: HOSPITAL_LINK_STATUS.offline.labelTh,
  [ConnectionStatus.UNKNOWN]: HOSPITAL_LINK_STATUS.unknown.labelTh,
};

export interface MapLegendItem {
  tone: HospitalStatusTone;
  label: string;
  sub: string;
}

export const MAP_LEGEND: Record<'light' | 'kiosk', { heading: string; ariaLabel: string; items: MapLegendItem[] }> = {
  light: {
    heading: 'สถานะการเชื่อมต่อ',
    ariaLabel: 'คำอธิบายสีจุดสถานะบนแผนที่',
    items: [
      { tone: 'ok', label: HOSPITAL_LINK_STATUS.online.labelTh, sub: 'ซิงค์ปกติ' },
      { tone: 'warn', label: HOSPITAL_LINK_STATUS.blocked.labelTh, sub: 'ระบบระงับไว้' },
      { tone: 'danger', label: HOSPITAL_LINK_STATUS.offline.labelTh, sub: 'ติดต่อตู้ BMS ไม่ได้' },
      {
        tone: 'neutral',
        label: `${HOSPITAL_LINK_STATUS.noSync.labelTh} / ${HOSPITAL_LINK_STATUS.unknown.labelTh}`,
        sub: 'ยังไม่มีข้อมูล',
      },
    ],
  },
  kiosk: {
    heading: 'STATUS DOT',
    ariaLabel: 'Map dot color legend',
    items: [
      { tone: 'ok', label: 'ONLINE', sub: 'sync ปกติ' },
      { tone: 'warn', label: 'BLOCKED', sub: 'sync ถูกระงับ' },
      { tone: 'danger', label: 'OFFLINE', sub: 'ติดต่อไม่ได้' },
      { tone: 'neutral', label: 'UNKNOWN', sub: 'ยังไม่ sync' },
    ],
  },
};
