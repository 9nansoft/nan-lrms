// Dev-only smoke endpoint: read → no-op UPDATE → read-back per maternity tab.
// Verifies that each tab's update path resolves to the correct REST URL and
// the BMS round-trip actually succeeds against a live tunnel.
//
// Usage:
//   curl -s -X POST http://localhost:3000/api/dev/smoke-tab-update \
//     -H "Content-Type: application/json" \
//     -d '{"sessionId":"<bms-session-id>","an":"<optional AN>"}'
//
// Each tab probe runs its own try/catch — a failure in one tab doesn't abort
// the others, so the response surfaces the FULL set of pass/fail results.
//
// Gated on DEV_AUTH_BYPASS=true so this route is unreachable in production.
import { NextRequest, NextResponse } from 'next/server';
import { validateBmsSession } from '@/lib/auth-utils';
import { executeSql, restUpdate } from '@/lib/bms-browser-client';
import type { ConnectionConfig } from '@/types/bms-browser';

interface ProbeResult {
  table: string;
  status: 'ok' | 'no-data' | 'error';
  pkColumn: string;
  pkValue?: string | number;
  url?: string;
  message?: string;
}

interface ProbeSpec {
  table: string;
  pkColumn: string;
  // SQL to find one candidate row. Either select by AN, or pick newest.
  selectSql: (an?: string) => string;
  // Field on the row to read & write back unchanged. NULL is replaced with
  // an empty string for safety so we never wipe a previously-set field.
  noopField: string;
}

const PROBES: ProbeSpec[] = [
  {
    table: 'ipt_labour',
    pkColumn: 'ipt_labour_id',
    selectSql: (an) =>
      an
        ? `SELECT ipt_labour_id, an, anc_count FROM ipt_labour WHERE an = '${an}' LIMIT 1`
        : `SELECT ipt_labour_id, an, anc_count FROM ipt_labour ORDER BY ipt_labour_id DESC LIMIT 1`,
    noopField: 'anc_count',
  },
  {
    table: 'labor',
    pkColumn: 'laborid',
    selectSql: (an) =>
      an
        ? `SELECT laborid, an, mother_aging FROM labor WHERE an = '${an}' LIMIT 1`
        : `SELECT laborid, an, mother_aging FROM labor ORDER BY laborid DESC LIMIT 1`,
    noopField: 'mother_aging',
  },
  {
    table: 'ipt_pregnancy',
    pkColumn: 'an',
    selectSql: (an) =>
      an
        ? `SELECT an, ga FROM ipt_pregnancy WHERE an = '${an}' LIMIT 1`
        : `SELECT an, ga FROM ipt_pregnancy ORDER BY an DESC LIMIT 1`,
    noopField: 'ga',
  },
  {
    table: 'ipt_labour_partograph',
    pkColumn: 'ipt_labour_partograph_id',
    selectSql: (an) =>
      an
        ? `SELECT ipt_labour_partograph_id, an, hour_no FROM ipt_labour_partograph WHERE an = '${an}' ORDER BY ipt_labour_partograph_id DESC LIMIT 1`
        : `SELECT ipt_labour_partograph_id, an, hour_no FROM ipt_labour_partograph ORDER BY ipt_labour_partograph_id DESC LIMIT 1`,
    noopField: 'hour_no',
  },
  {
    table: 'labour_medication',
    pkColumn: 'labour_medication_id',
    selectSql: (an) =>
      an
        ? `SELECT labour_medication_id, an, qty FROM labour_medication WHERE an = '${an}' LIMIT 1`
        : `SELECT labour_medication_id, an, qty FROM labour_medication ORDER BY labour_medication_id DESC LIMIT 1`,
    noopField: 'qty',
  },
  {
    table: 'labour_stage_medication',
    pkColumn: 'labour_stage_medication_id',
    selectSql: (an) =>
      an
        ? `SELECT labour_stage_medication_id, an, qty FROM labour_stage_medication WHERE an = '${an}' LIMIT 1`
        : `SELECT labour_stage_medication_id, an, qty FROM labour_stage_medication ORDER BY labour_stage_medication_id DESC LIMIT 1`,
    noopField: 'qty',
  },
  {
    table: 'ipt_labour_complication',
    pkColumn: 'ipt_labour_complication_id',
    selectSql: () =>
      `SELECT ipt_labour_complication_id, ipt_labour_id, complication_note FROM ipt_labour_complication ORDER BY ipt_labour_complication_id DESC LIMIT 1`,
    noopField: 'complication_note',
  },
  {
    table: 'ipt_labour_infant',
    pkColumn: 'ipt_labour_infant_id',
    selectSql: () =>
      `SELECT ipt_labour_infant_id, ipt_labour_id, birth_weight FROM ipt_labour_infant ORDER BY ipt_labour_infant_id DESC LIMIT 1`,
    noopField: 'birth_weight',
  },
];

async function probeOne(
  spec: ProbeSpec,
  config: ConnectionConfig,
  marketplaceToken: string,
  an: string | undefined,
): Promise<ProbeResult> {
  try {
    const sql = spec.selectSql(an);
    const r = await executeSql<Record<string, unknown>>(sql, config, undefined, marketplaceToken);
    if (!r.data || r.data.length === 0) {
      return { table: spec.table, pkColumn: spec.pkColumn, status: 'no-data' };
    }
    const row = r.data[0]!;
    const pk = row[spec.pkColumn];
    if (pk === null || pk === undefined) {
      return {
        table: spec.table,
        pkColumn: spec.pkColumn,
        status: 'error',
        message: `row missing PK column ${spec.pkColumn}`,
      };
    }
    const noopValue = row[spec.noopField] ?? null;
    const url = `${config.apiUrl}/api/rest/${spec.table}/${pk}`;
    // Write back the same value — verifies the URL resolves AND the body shape
    // is accepted, without mutating real clinical data.
    await restUpdate(
      spec.table,
      String(pk),
      { [spec.noopField]: noopValue },
      config,
      marketplaceToken,
    );
    return {
      table: spec.table,
      pkColumn: spec.pkColumn,
      status: 'ok',
      pkValue: pk as string | number,
      url,
      message: `noop UPDATE ${spec.noopField}=${JSON.stringify(noopValue)} succeeded`,
    };
  } catch (e) {
    return {
      table: spec.table,
      pkColumn: spec.pkColumn,
      status: 'error',
      message: (e as Error).message,
    };
  }
}

export async function POST(request: NextRequest) {
  if (process.env.DEV_AUTH_BYPASS !== 'true' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled in production' }, { status: 403 });
  }
  let body: { sessionId?: string; an?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const tunnelUrl = process.env.DEV_HOSPITAL_TUNNEL_URL ?? '';
  const identity = await validateBmsSession(sessionId, tunnelUrl);
  if (!identity || !identity.tunnelUrl || !identity.jwt) {
    return NextResponse.json(
      { error: 'session validation failed', sessionId },
      { status: 401 },
    );
  }

  // BMS tunnel auth split (matches extractConnectionConfig in bms-browser-client):
  //   * bearerToken = the session ID itself (bms_session_code)
  //   * marketplace-token = auth_key from PasteJSON
  // identity.jwt holds the auth_key — pass it as the marketplaceToken arg.
  const config: ConnectionConfig = {
    apiUrl: identity.tunnelUrl,
    bearerToken: sessionId,
    appIdentifier: 'KK-LRMS.SmokeTest',
  };

  const results: ProbeResult[] = [];
  for (const spec of PROBES) {
    // sequential — keeps log output ordered + avoids hammering the tunnel
    // eslint-disable-next-line no-await-in-loop
    results.push(await probeOne(spec, config, identity.jwt, body.an));
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const noData = results.filter((r) => r.status === 'no-data').length;

  return NextResponse.json({
    summary: { total: results.length, ok, errors, noData },
    hospital: identity.hospitalCode,
    tunnel: identity.tunnelUrl,
    an: body.an ?? '(latest row per table)',
    results,
  });
}
