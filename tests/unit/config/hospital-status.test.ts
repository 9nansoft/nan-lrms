import { describe, it, expect } from 'vitest';
import {
  classifyHospitalLink,
  CONNECTION_LABEL_TH,
  HOSPITAL_LINK_STATUS,
  hospitalLinkText,
  kioskLinkText,
  MAP_LEGEND,
  SYNC_HEALTH_TH,
} from '@/config/hospital-status';
import { SYNC_HEALTH } from '@/config/hospital-network';
import { ConnectionStatus } from '@/types/domain';

// The three legacy inline chains this module replaces, copied verbatim from
// ProvinceMapLeaflet (pin dot + tooltip) and HospitalTable (badge) before the
// refactor. classifyHospitalLink must agree with every one of them.
function legacyTable(conn: string, sync: string) {
  const isBlocked = sync === 'BLOCKED';
  const isNever = sync === 'NEVER_SYNCED';
  const isOnline = conn === 'ONLINE';
  const isOffline = conn === 'OFFLINE';
  return isBlocked ? 'BLOCKED' : isNever && !isOffline ? 'NO SYNC' : isOnline ? 'ONLINE' : isOffline ? 'OFFLINE' : 'UNKNOWN';
}
function legacyTooltip(conn: string, sync: string) {
  const isBlocked = sync === 'BLOCKED';
  const isNever = sync === 'NEVER_SYNCED';
  return isBlocked ? 'BLOCKED' : conn === 'ONLINE' && !isNever ? 'ONLINE' : conn === 'OFFLINE' ? 'OFFLINE' : isNever ? 'NO SYNC' : 'UNKNOWN';
}

const CONNS = ['ONLINE', 'OFFLINE', 'UNKNOWN'];
const SYNCS = ['OK', 'BLOCKED', 'NEVER_SYNCED'];

describe('classifyHospitalLink', () => {
  it.each(CONNS.flatMap((c) => SYNCS.map((s) => [c, s] as const)))(
    '%s + %s matches the legacy badge and tooltip precedence',
    (conn, sync) => {
      const status = classifyHospitalLink(conn, sync);
      expect(HOSPITAL_LINK_STATUS[status].kioskLabel).toBe(legacyTable(conn, sync));
      expect(HOSPITAL_LINK_STATUS[status].kioskLabel).toBe(legacyTooltip(conn, sync));
    },
  );

  it('treats missing values as unknown / never synced', () => {
    expect(classifyHospitalLink(undefined, undefined)).toBe('unknown');
    expect(classifyHospitalLink('ONLINE', 'NEVER_SYNCED')).toBe('noSync');
  });
});

describe('Thai words', () => {
  it('uses the app connection words and shares sync words across vocabularies', () => {
    expect(HOSPITAL_LINK_STATUS.online.labelTh).toBe('ออนไลน์');
    expect(HOSPITAL_LINK_STATUS.offline.labelTh).toBe('ออฟไลน์');
    expect(HOSPITAL_LINK_STATUS.unknown.labelTh).toBe('ไม่ทราบ');
    expect(SYNC_HEALTH_TH.blocked).toBe(HOSPITAL_LINK_STATUS.blocked.labelTh);
    expect(SYNC_HEALTH_TH.never).toBe(HOSPITAL_LINK_STATUS.noSync.labelTh);
    expect(CONNECTION_LABEL_TH[ConnectionStatus.ONLINE]).toBe('ออนไลน์');
    expect(CONNECTION_LABEL_TH[ConnectionStatus.OFFLINE]).toBe('ออฟไลน์');
    expect(CONNECTION_LABEL_TH[ConnectionStatus.UNKNOWN]).toBe('ไม่ทราบ');
  });

  it('builds sync-age labels from SYNC_HEALTH, spelled ซิงค์', () => {
    expect(SYNC_HEALTH_TH.stale).toContain(String(SYNC_HEALTH.staleAfterMinutes));
    expect(SYNC_HEALTH_TH.critical).toContain(String(SYNC_HEALTH.criticalAfterHours));
    for (const v of Object.values(SYNC_HEALTH_TH)) expect(v).not.toContain('ซิงก์');
  });

  it('light text is Thai and carries the blocked reason', () => {
    expect(hospitalLinkText('blocked', 'missing_marketplace_token')).toEqual({
      label: 'ระงับการซิงค์',
      detail: 'ระบบระงับการซิงค์ของโรงพยาบาลนี้ — missing_marketplace_token',
    });
    expect(hospitalLinkText('blocked', null).detail).toContain('ไม่ทราบสาเหตุ');
    expect(hospitalLinkText('online').label).toBe('ออนไลน์');
  });
});

describe('kiosk copy is frozen verbatim', () => {
  it('pin titles keep the legacy never-synced-first precedence', () => {
    expect(kioskLinkText('OFFLINE', 'NEVER_SYNCED').pinTitle).toBe('ยังไม่เคยมีการเชื่อมต่อ Sync');
    expect(kioskLinkText('ONLINE', 'OK').pinTitle).toBe('Online');
    expect(kioskLinkText('OFFLINE', 'OK').pinTitle).toBe('Offline');
    expect(kioskLinkText('UNKNOWN', 'OK').pinTitle).toBe('Unknown');
    expect(kioskLinkText('ONLINE', 'BLOCKED', null).pinTitle).toBe('Sync ถูกระงับ — unknown');
  });

  it('tooltip label/detail match the legacy chains', () => {
    expect(kioskLinkText('OFFLINE', 'NEVER_SYNCED')).toMatchObject({ label: 'OFFLINE', detail: 'ยังไม่เคยเชื่อม sync' });
    expect(kioskLinkText('ONLINE', 'OK')).toMatchObject({ label: 'ONLINE', detail: 'sync ปกติ' });
    expect(kioskLinkText('OFFLINE', 'OK')).toMatchObject({ label: 'OFFLINE', detail: 'ติดต่อตู้ BMS ไม่ได้' });
    expect(kioskLinkText('UNKNOWN', 'OK')).toMatchObject({ label: 'UNKNOWN', detail: 'ยังไม่ทราบสถานะ' });
    expect(kioskLinkText('ONLINE', 'BLOCKED', 'x').detail).toBe('Sync ถูกระงับ — x');
  });

  it('kiosk legend is byte-identical; light legend is Thai', () => {
    expect(MAP_LEGEND.kiosk.heading).toBe('STATUS DOT');
    expect(MAP_LEGEND.kiosk.ariaLabel).toBe('Map dot color legend');
    expect(MAP_LEGEND.kiosk.items.map((i) => [i.label, i.sub])).toEqual([
      ['ONLINE', 'sync ปกติ'],
      ['BLOCKED', 'sync ถูกระงับ'],
      ['OFFLINE', 'ติดต่อไม่ได้'],
      ['UNKNOWN', 'ยังไม่ sync'],
    ]);
    expect(MAP_LEGEND.light.heading).toBe('สถานะการเชื่อมต่อ');
    expect(MAP_LEGEND.light.items.map((i) => i.label)).toEqual([
      'ออนไลน์',
      'ระงับการซิงค์',
      'ออฟไลน์',
      'ยังไม่เคยซิงค์ / ไม่ทราบ',
    ]);
    expect(MAP_LEGEND.light.items.map((i) => i.tone)).toEqual(MAP_LEGEND.kiosk.items.map((i) => i.tone));
  });
});
