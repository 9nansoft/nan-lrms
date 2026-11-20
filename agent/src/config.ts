// Agent configuration — read once at start-up.
//
// The config file holds a hospital-scoped API key, so it is as sensitive as
// a password: keep it on the hospital's own machine, readable only by the
// account that runs the agent.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface AgentConfig {
  /** NN-LRMS server origin, e.g. https://kk-lrms.bmscloud.in.th */
  serverUrl: string;
  /** Hospital-scoped API key (Authorization: Bearer <apiKey>). */
  apiKey: string;
  /** How often to pull. Default 5 minutes. */
  intervalMinutes: number;
  /** The HOSxP BMS gateway on THIS machine. */
  localGateway: string;
  /**
   * Gateway token — the credential the local gateway asks for before it
   * hands out a live BMS session (GET /api/GetBMSSessionID). It belongs to
   * THIS workstation; treat it like a password.
   */
  gatewayToken: string;
  /**
   * Marketplace token — HOSxP randomises CID/HN for API calls that arrive
   * without it. Optional when the local gateway is used (the hospital's own
   * gateway serves the real rows).
   */
  marketplaceToken: string | null;
}

export const DEFAULT_INTERVAL_MINUTES = 5;
export const DEFAULT_LOCAL_GATEWAY = 'http://127.0.0.1:45011';

function fail(message: string): never {
  throw new Error(`[agent] ${message}`);
}

/**
 * Where the config lives: AGENT_CONFIG env, else agent.config.json beside
 * the running file, else one directory up (the bundled layout is
 * agent/dist/agent.mjs with agent/agent.config.json).
 *
 * The script directory comes from process.argv[1] rather than
 * import.meta.url — the Windows build is a CommonJS bundle packaged as
 * agent.exe, where import.meta does not exist.
 */
export function configPath(): string {
  const fromEnv = process.env.AGENT_CONFIG;
  // An env override wins only when the file is actually there — a stale
  // path (e.g. an unexpanded %BASE% from the service definition) must not
  // stop the agent from finding the config next to its own file.
  if (fromEnv && fromEnv.length > 0 && existsSync(resolve(fromEnv))) return resolve(fromEnv);
  const here = scriptDir();
  const beside = join(here, 'agent.config.json');
  if (existsSync(beside)) return beside;
  return join(here, '..', 'agent.config.json');
}

/** Directory of the running script (the .mjs, or the packaged .exe). */
function scriptDir(): string {
  const entry = process.argv[1];
  // A compiled binary reports its own path inside the runtime's virtual
  // filesystem (/$bunfs/...), which is NOT where the config sits — the
  // config lives next to the .exe on disk, and process.execPath is that
  // path. A plain script (node agent.mjs) has a real path in argv[1].
  const fromEntry = entry && !entry.startsWith('/$bunfs/') ? entry : null;
  const target = fromEntry ?? process.execPath;
  if (target && target.length > 0) return dirname(resolve(target));
  return process.cwd();
}

export function loadConfig(path: string = configPath()): AgentConfig {
  if (!existsSync(path)) {
    fail(
      `ไม่พบไฟล์ตั้งค่า ${path} — คัดลอก agent/config.example.json ไปเป็น agent.config.json แล้วแก้ค่า`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`อ่าน ${path} ไม่ได้: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!raw || typeof raw !== 'object') fail(`${path} ต้องเป็น JSON object`);
  const obj = raw as Record<string, unknown>;

  const serverUrl = typeof obj.serverUrl === 'string' ? obj.serverUrl.trim() : '';
  if (!serverUrl) fail('ต้องมี "serverUrl" (เช่น https://kk-lrms.bmscloud.in.th)');
  const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey.trim() : '';
  if (!apiKey) fail('ต้องมี "apiKey" (คีย์จากผู้ดูแลระบบ)');
  const intervalMinutes =
    typeof obj.intervalMinutes === 'number' && obj.intervalMinutes > 0
      ? Math.floor(obj.intervalMinutes)
      : DEFAULT_INTERVAL_MINUTES;
  const localGateway =
    typeof obj.localGateway === 'string' && obj.localGateway.trim().length > 0
      ? obj.localGateway.trim()
      : DEFAULT_LOCAL_GATEWAY;
  const gatewayToken =
    typeof obj.gatewayToken === 'string' ? obj.gatewayToken.trim() : '';
  if (!gatewayToken) {
    fail(
      'ต้องมี "gatewayToken" (โทเคนของ BMS gateway บนเครื่องนี้ — ใช้เรียก /api/GetBMSSessionID)',
    );
  }
  const marketplaceToken =
    typeof obj.marketplaceToken === 'string' && obj.marketplaceToken.trim().length > 0
      ? obj.marketplaceToken.trim()
      : null;

  return {
    serverUrl: serverUrl.replace(/\/+$/, ''),
    apiKey,
    intervalMinutes,
    localGateway,
    gatewayToken,
    marketplaceToken,
  };
}
