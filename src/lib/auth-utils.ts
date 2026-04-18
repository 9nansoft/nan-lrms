// T085: Auth utility functions — separated from NextAuth config for testability
import { UserRole } from '@/types/domain';
import { logger } from '@/lib/logger';

export function mapPositionToRole(position: string): UserRole {
  const lower = position.toLowerCase();
  if (lower.includes('director') || lower.includes('ผู้อำนวยการ')) {
    return UserRole.ADMIN;
  }
  if (lower.includes('doctor') || lower.includes('แพทย์') || lower.includes('สูติ')) {
    return UserRole.OBSTETRICIAN;
  }
  return UserRole.NURSE;
}

export interface BmsUserIdentity {
  name: string;
  role: UserRole;
  hospitalCode: string;
  hospitalName: string;
  tunnelUrl: string;
  databaseType: string;
  jwt: string;
  expiresAt: string;
}

export async function validateBmsSession(
  sessionId: string,
  _tunnelUrl: string,
): Promise<BmsUserIdentity | null> {
  // Dev auth bypass — accept any session ID as admin
  if (process.env.DEV_AUTH_BYPASS === 'true') {
    logger.info('auth_dev_bypass', { sessionId, role: 'ADMIN' });
    return {
      name: 'Dev Admin (ผู้ดูแลระบบ)',
      role: UserRole.ADMIN,
      hospitalCode: '10670',
      hospitalName: 'รพ.ชุมแพ',
      tunnelUrl: process.env.DEV_HOSPITAL_TUNNEL_URL ?? '',
      databaseType: 'postgresql',
      jwt: 'dev-jwt-token',
      expiresAt: new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
  }

  try {
    const validateUrl = process.env.BMS_VALIDATE_URL ?? 'https://hosxp.net/phapi/PasteJSON';

    // BMS PasteJSON API uses GET with Action=GET&code=<session-id>
    const response = await fetch(
      `${validateUrl}?Action=GET&code=${encodeURIComponent(sessionId)}`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (data.MessageCode !== 200 || !data.result?.user_info) return null;

    const userInfo = data.result.user_info;

    const hcode = userInfo.hospital_code ?? '';
    return {
      name: userInfo.name ?? 'Unknown',
      role: mapPositionToRole(userInfo.position ?? ''),
      hospitalCode: hcode,
      hospitalName: userInfo.location && userInfo.location !== 'server' ? userInfo.location : `รพ.${hcode}`,
      tunnelUrl: userInfo.bms_url ?? '',
      databaseType: (userInfo.bms_database_type ?? 'postgresql').toLowerCase(),
      jwt: data.result.auth_key ?? '',
      expiresAt: new Date(Date.now() + (data.result.expired_second ?? 28800) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}
