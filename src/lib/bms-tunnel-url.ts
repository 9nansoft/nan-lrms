// The HOSxP tunnel URL is a CREDENTIAL DESTINATION.
//
// Every server-side call to a hospital's HOSxP carries that hospital's
// bearer token and its marketplace token. If the stored URL can point
// anywhere else, those credentials go with it — so the URL is validated
// twice: when it is stored (onboarding) and again immediately before it is
// used (the server-side backstop).
//
// What is accepted: HTTPS, no userinfo, and a host on the trusted list.
// The default trusted list is the BMS marketplace's own tunnel domain; a
// deployment that reaches HOSxP through another name adds it explicitly
// (BMS_ALLOWED_TUNNEL_HOSTS). Failing closed is the point: a hospital that
// is not reachable through a trusted tunnel keeps its browser/agent path
// (which uses the LOCAL gateway on its own machine and never involves the
// server) and simply is not polled by the backstop.

const DEFAULT_TRUSTED_HOST_SUFFIXES = ['.tunnel.hosxp.net'];

/** Extra trusted hosts/suffixes, comma separated. */
/** Hosts an administrator allowed explicitly (beyond the marketplace's). */
export function extraTunnelHostSuffixes(): string[] {
  return (process.env.BMS_ALLOWED_TUNNEL_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith('.') ? s : `.${s}`));
}

export function trustedTunnelHostSuffixes(): string[] {
  return [...DEFAULT_TRUSTED_HOST_SUFFIXES, ...extraTunnelHostSuffixes()];
}

export function isTrustedTunnelHost(host: string): boolean {
  const h = host.toLowerCase();
  const suffixes = trustedTunnelHostSuffixes();
  return suffixes.some((suffix) => h === suffix.slice(1) || h.endsWith(suffix));
}

/** Loopback / RFC1918 / link-local / unique-local — never a public tunnel. */
function isPrivateHostLiteral(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

export type TunnelUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Does this tunnel host belong to THIS hospital?
 *
 * The marketplace names each hospital's tunnel after it
 * (`10716-saciw.tunnel.hosxp.net`), so the first label carries the hospital
 * code. Requiring it stops one hospital from pointing the server's
 * credentials at another hospital's tunnel — a trusted host is not enough.
 *
 * A deployment that names its tunnels differently must list the host
 * explicitly in BMS_ALLOWED_TUNNEL_HOSTS; that is an administrator's
 * decision, not something a client can claim.
 */
export function tunnelHostBelongsToHospital(host: string, hcode: string): boolean {
  const label = host.toLowerCase().split('.')[0] ?? '';
  const code = hcode.trim().toLowerCase();
  if (!code) return false;
  return label.includes(code);
}

/** True when the host matches an EXTRA allowlist entry (not the default). */
export function matchesExplicitTunnelHost(host: string): boolean {
  const h = host.toLowerCase();
  const extras = extraTunnelHostSuffixes();
  return extras.some((suffix) => h === suffix.slice(1) || h.endsWith(suffix));
}

/**
 * Validate a tunnel URL.
 *
 * `requireTrustedHost` is on for every place the SERVER sends a bearer
 * token or marketplace token to the URL.
 */
export function validateTunnelUrl(
  raw: string | null | undefined,
  opts: { requireTrustedHost?: boolean; hcode?: string } = {},
): TunnelUrlCheck {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: 'empty_url' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'https_required' };
  if (url.username || url.password) return { ok: false, reason: 'userinfo_not_allowed' };
  if (isPrivateHostLiteral(url.hostname)) return { ok: false, reason: 'private_address_not_allowed' };
  if (opts.requireTrustedHost && !isTrustedTunnelHost(url.hostname)) {
    return { ok: false, reason: 'untrusted_tunnel_host' };
  }
  // The tunnel must be THIS hospital's: a trusted host alone would still let
  // one site point the server's credentials at another site's tunnel.
  if (
    opts.hcode &&
    !tunnelHostBelongsToHospital(url.hostname, opts.hcode) &&
    !matchesExplicitTunnelHost(url.hostname)
  ) {
    return { ok: false, reason: 'tunnel_host_not_belonging_to_hospital' };
  }
  return { ok: true, url };
}

/** Thai explanation for a rejected tunnel URL — says what to do next. */
export function tunnelUrlErrorMessage(reason: string): string {
  switch (reason) {
    case 'empty_url':
      return 'ไม่พบ URL ของ BMS tunnel';
    case 'invalid_url':
      return 'URL ของ BMS tunnel ไม่ถูกต้อง';
    case 'https_required':
      return 'URL ของ BMS tunnel ต้องเป็น https';
    case 'userinfo_not_allowed':
      return 'URL ของ BMS tunnel ต้องไม่มี user:password ในตัว';
    case 'private_address_not_allowed':
      return 'URL ของ BMS tunnel ต้องไม่ชี้เข้าเครือข่ายภายใน (127.0.0.1 / 10.x / 192.168.x / 172.16-31.x)';
    case 'tunnel_host_not_belonging_to_hospital':
      return (
        'โฮสต์ของ BMS tunnel ไม่ใช่ของโรงพยาบาลนี้ (ชื่อ tunnel ต้องมีรหัสโรงพยาบาล) — ' +
        'ให้ผู้ดูแลระบบเพิ่มโฮสต์นี้ใน BMS_ALLOWED_TUNNEL_HOSTS ถ้าเป็นการตั้งค่าพิเศษ'
      );
    case 'untrusted_tunnel_host':
      return (
        'โฮสต์ของ BMS tunnel ไม่อยู่ในรายการที่เชื่อถือได้ ' +
        '(ค่าเริ่มต้น *.tunnel.hosxp.net) — ให้ผู้ดูแลระบบเพิ่มโฮสต์นี้ใน BMS_ALLOWED_TUNNEL_HOSTS'
      );
    default:
      return 'URL ของ BMS tunnel ไม่ผ่านการตรวจสอบ';
  }
}
