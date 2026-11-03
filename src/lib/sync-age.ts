// Human-readable data freshness. Classification is delegated to
// classifySyncHealth (the same 60-min / 24-h policy /api/health uses), so the
// badge, the status strip and the health endpoint can never disagree.
import { classifySyncHealth, SYNC_FRESHNESS_POLL, type SyncHealthClass } from '@/config/hospital-network';
import type { StatusTone } from '@/config/status-tone';

export type FreshnessTone = Extract<StatusTone, 'ok' | 'warn' | 'danger'>;

export interface SyncAge {
  health: SyncHealthClass;
  tone: FreshnessTone;
  clock: string | null;
  relative: string;
}

export const HEALTH_TONE: Record<SyncHealthClass, FreshnessTone> = {
  ok: 'ok',
  stale: 'warn',
  critical: 'danger',
  never: 'danger',
  blocked: 'danger',
};

const DAY_MIN = 1440;

/** HH:MM on the Bangkok wall clock, whatever the client's time zone. */
export function bangkokClock(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function bangkokDate(d: Date): string {
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
}

export function describeSyncAge(
  lastSyncAt: string | null | undefined,
  syncStatus = 'OK',
  now: Date = new Date(),
): SyncAge {
  const t = lastSyncAt ? new Date(lastSyncAt).getTime() : NaN;
  if (!Number.isFinite(t)) {
    return { health: 'never', tone: 'danger', clock: null, relative: 'ยังไม่เคยซิงค์' };
  }
  const synced = new Date(t);
  const mins = Math.floor((now.getTime() - t) / 60_000);
  const clock = mins >= DAY_MIN ? `${bangkokDate(synced)} ${bangkokClock(synced)}` : bangkokClock(synced);

  if (mins < 0) {
    return { health: 'stale', tone: 'warn', clock, relative: 'เวลาซิงค์ล่วงหน้า — ตรวจสอบนาฬิกาเครื่อง' };
  }
  const health = classifySyncHealth(syncStatus, lastSyncAt, now);
  let relative: string;
  if (mins < 1) relative = 'เมื่อสักครู่';
  else if (mins < 60) relative = `${mins} นาทีที่แล้ว`;
  else if (mins < DAY_MIN) relative = `${Math.floor(mins / 60)} ชั่วโมงที่แล้ว`;
  else relative = `${Math.floor(mins / DAY_MIN)} วันที่แล้ว`;
  return { health, tone: HEALTH_TONE[health], clock, relative };
}

/** Is a client-side freshness snapshot still trustworthy? `receivedAt` is the
 *  client time the response arrived (client-vs-client, so no clock skew). */
export function isSnapshotCurrent({
  receivedAt,
  hasError,
  now = Date.now(),
}: {
  receivedAt: number;
  hasError: boolean;
  now?: number;
}): boolean {
  if (hasError || !Number.isFinite(receivedAt)) return false;
  return now - receivedAt <= SYNC_FRESHNESS_POLL.maxSnapshotAgeMs;
}
