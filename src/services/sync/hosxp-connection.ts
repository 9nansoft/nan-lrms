// Filling in the server's HOSxP connection facts from the hospital side.
//
// The server pulls a hospital's data over the BMS TUNNEL, so it needs the
// tunnel URL and the marketplace token. Both used to come from the browser
// onboarding flow only (a staff member opening NN-LRMS from the HOSxP menu).
// A hospital that runs the agent but never opens a browser would then have
// no tunnel at all — the server-side assessment timer skips it entirely.
//
// The agent already knows both: the gateway reports the tunnel URL on every
// cycle, and the marketplace token can be configured for it. So it may hand
// them to the server.
//
// SECURITY: the agent may only FILL IN what is missing. An existing tunnel
// URL is never overwritten from the hospital side — otherwise a hospital
// could point the server's credentials at another site's tunnel. The tunnel
// URL is additionally validated against the trusted-host allowlist by the
// caller (src/lib/bms-tunnel-url.ts) before it gets here.
import type { DatabaseAdapter } from '@/db/adapter';
import { encrypt, decryptSafe, getEncryptionKey } from '@/lib/encryption';
import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/logger';

export interface HosxpConnectionFacts {
  /** The hospital's BMS tunnel URL (from the local gateway). */
  bmsUrl?: string | null;
  /** The hospital's marketplace token — a credential, stored encrypted. */
  marketplaceToken?: string | null;
}

export interface AppliedConnection {
  /** True when the tunnel URL was written (it was missing before). */
  tunnelUrlSet: boolean;
  /** True when the marketplace token was written. */
  marketplaceTokenSet: boolean;
}

export async function applyHosxpConnectionFacts(
  db: DatabaseAdapter,
  hospitalId: string,
  facts: HosxpConnectionFacts,
): Promise<AppliedConnection> {
  const applied: AppliedConnection = { tunnelUrlSet: false, marketplaceTokenSet: false };

  const rows = await db.query<{
    id: string;
    tunnel_url: string | null;
    marketplace_token: string | null;
  }>(
    'SELECT id, tunnel_url, marketplace_token FROM hospital_bms_config WHERE hospital_id = ?',
    [hospitalId],
  );
  const current = rows[0];

  const bmsUrl = facts.bmsUrl?.trim() ?? '';
  const token = facts.marketplaceToken?.trim() ?? '';

  const needTunnel = !current?.tunnel_url && bmsUrl.length > 0;
  const needToken =
    token.length > 0 &&
    (!current?.marketplace_token || decryptSafe(current.marketplace_token).length === 0);

  if (!needTunnel && !needToken) return applied;

  // A hospital_bms_config row needs a tunnel URL (the column is NOT NULL in
  // the live schema). Without one there is no row to update — the token waits
  // until the agent hands over the tunnel as well.
  if (!current && !needTunnel) return applied;

  const now = new Date().toISOString();
  if (current) {
    await db.execute(
      `UPDATE hospital_bms_config
          SET tunnel_url = COALESCE(tunnel_url, ?),
              marketplace_token = COALESCE(marketplace_token, ?),
              updated_at = ?
        WHERE hospital_id = ?`,
      [needTunnel ? bmsUrl : null, needToken ? encrypt(token, getEncryptionKey()) : null, now, hospitalId],
    );
  } else {
    await db.execute(
      `INSERT INTO hospital_bms_config
         (id, hospital_id, tunnel_url, marketplace_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        hospitalId,
        needTunnel ? bmsUrl : null,
        needToken ? encrypt(token, getEncryptionKey()) : null,
        now,
        now,
      ],
    );
  }

  applied.tunnelUrlSet = needTunnel;
  applied.marketplaceTokenSet = needToken;
  logger.info('hosxp_connection_filled_from_hospital', {
    hospitalId,
    tunnelUrlSet: applied.tunnelUrlSet,
    marketplaceTokenSet: applied.marketplaceTokenSet,
  });
  return applied;
}
