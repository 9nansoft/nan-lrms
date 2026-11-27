// Agent config path & parsing — ensures packaged binaries (pkg / bun) look
// beside process.execPath instead of inside their virtual snapshot filesystem.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, scriptDir } from '../../../agent/src/config';

describe('scriptDir', () => {
  it('uses process.execPath when argv[1] is a pkg Windows snapshot path', () => {
    expect(scriptDir('C:\\snapshot\\agent\\dist\\agent.cjs', '/tmp/nn-lrms/nn-lrms-agent.exe')).toBe(
      resolve('/tmp/nn-lrms'),
    );
  });

  it('uses process.execPath when argv[1] is a pkg POSIX snapshot path', () => {
    expect(scriptDir('/snapshot/agent/dist/agent.cjs', '/opt/nn-lrms/nn-lrms-agent')).toBe(
      resolve('/opt/nn-lrms'),
    );
  });

  it('uses process.execPath when argv[1] is a Bun virtual path', () => {
    expect(scriptDir('/$bunfs/root/agent', '/opt/nn-lrms/agent')).toBe(resolve('/opt/nn-lrms'));
  });

  it('uses process.execPath whenever process.pkg is defined', () => {
    (process as { pkg?: unknown }).pkg = { entrypoint: '/snapshot/agent.cjs' };
    try {
      expect(scriptDir('/some/virtual/path.cjs', '/opt/nn-lrms/nn-lrms-agent')).toBe(
        resolve('/opt/nn-lrms'),
      );
    } finally {
      delete (process as { pkg?: unknown }).pkg;
    }
  });

  it('uses argv[1] directory for a plain Node script', () => {
    expect(scriptDir('/opt/nn-lrms-agent/dist/agent.mjs', '/usr/bin/node')).toBe(
      resolve('/opt/nn-lrms-agent/dist'),
    );
  });
});

describe('loadConfig', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'nn-lrms-agent-cfg-'));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('parses valid config and strips trailing slashes', () => {
    const file = join(work, 'agent.config.json');
    writeFileSync(
      file,
      JSON.stringify({
        serverUrl: 'https://lrms.example.th/',
        apiKey: 'kklrms_abc',
        intervalMinutes: 5,
        localGateway: 'http://127.0.0.1:45012/',
        gatewayToken: 'gw-secret',
        marketplaceToken: 'mkt-123',
      }),
    );

    expect(loadConfig(file)).toEqual({
      serverUrl: 'https://lrms.example.th',
      apiKey: 'kklrms_abc',
      intervalMinutes: 5,
      localGateway: 'http://127.0.0.1:45012',
      gatewayToken: 'gw-secret',
      marketplaceToken: 'mkt-123',
    });
  });

  it('rejects config missing gatewayToken', () => {
    const file = join(work, 'agent.config.json');
    writeFileSync(
      file,
      JSON.stringify({
        serverUrl: 'https://lrms.example.th',
        apiKey: 'kklrms_abc',
      }),
    );

    expect(() => loadConfig(file)).toThrow(/gatewayToken/);
  });
});
