// The tunnel URL is a credential destination: the server attaches the
// hospital's bearer token and marketplace token to every call it makes
// there. A URL that points anywhere else hands those credentials over, so
// it is checked when it is stored and again before it is used.
import { describe, it, expect } from 'vitest';
import {
  validateTunnelUrl,
  isTrustedTunnelHost,
  tunnelUrlErrorMessage,
} from '@/lib/bms-tunnel-url';

describe('validateTunnelUrl', () => {
  it('accepts a marketplace tunnel over https', () => {
    const check = validateTunnelUrl('https://00000-ondemand-win-3ru63gfld9e.tunnel.hosxp.net', {
      requireTrustedHost: true,
    });
    expect(check.ok).toBe(true);
  });

  it('rejects plain http', () => {
    const check = validateTunnelUrl('http://00000-ondemand-win-3ru63gfld9e.tunnel.hosxp.net');
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toBe('https_required');
  });

  it('rejects a URL with credentials in it', () => {
    const check = validateTunnelUrl('https://user:pass@tunnel.hosxp.net');
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toBe('userinfo_not_allowed');
  });

  it('rejects a loopback or LAN address', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '192.168.1.10', '172.16.4.4', '169.254.1.1', 'localhost']) {
      const check = validateTunnelUrl(`https://${host}`);
      expect(check.ok).toBe(false);
      expect(check.ok === false && check.reason).toBe('private_address_not_allowed');
    }
  });

  it('rejects a host that is not on the trusted list', () => {
    const check = validateTunnelUrl('https://evil.example.com', { requireTrustedHost: true });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toBe('untrusted_tunnel_host');
  });

  it('binds the tunnel to the hospital when the code is given', () => {
    const own = validateTunnelUrl('https://10670-saciw.tunnel.hosxp.net', {
      requireTrustedHost: true,
      hcode: '10670',
    });
    expect(own.ok).toBe(true);

    const other = validateTunnelUrl('https://10999-other.tunnel.hosxp.net', {
      requireTrustedHost: true,
      hcode: '10670',
    });
    expect(other.ok).toBe(false);
    expect(other.ok === false && other.reason).toBe('tunnel_host_not_belonging_to_hospital');
  });

  it('explains every rejection in Thai', () => {
    expect(tunnelUrlErrorMessage('https_required')).toContain('https');
    expect(tunnelUrlErrorMessage('untrusted_tunnel_host')).toContain('BMS_ALLOWED_TUNNEL_HOSTS');
  });
});

describe('isTrustedTunnelHost', () => {
  it('trusts the marketplace tunnel domain and nothing else', () => {
    expect(isTrustedTunnelHost('00000-ondemand-win-3ru63gfld9e.tunnel.hosxp.net')).toBe(true);
    expect(isTrustedTunnelHost('tunnel.hosxp.net')).toBe(true);
    expect(isTrustedTunnelHost('hosxp.net.evil.com')).toBe(false);
    expect(isTrustedTunnelHost('evil.com')).toBe(false);
  });
});
