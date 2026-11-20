// The agent package assembler.
//
// A hospital receives a FOLDER, not a file: the agent exe, the WinSW
// wrapper, the service definition, the config template, three .cmd helpers,
// the install guide, VERSION.txt and SHA256SUMS.txt. This test pins what the
// folder must contain and what must be true of it (the checksum file has to
// match the bytes that ship, or the hospital cannot verify what it got).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleAgentPackage,
  PACKAGE_FILES,
  TEMPLATE_FILES,
  winswHint,
} from '../../../tools/package-agent';

let work: string;

async function writeStub(path: string, content: string): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content, 'utf8');
  return path;
}

describe('assembleAgentPackage', () => {
  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'nn-lrms-agent-pkg-'));
  });

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it('refuses to build without the hand-placed WinSW binary', async () => {
    await expect(
      assembleAgentPackage({
        exePath: join(work, 'agent.exe'),
        winswPath: null,
        outDir: join(work, 'out'),
        version: '1.0.0',
      }),
    ).rejects.toThrow(/WinSW/);
  });

  it('refuses to overwrite an existing output folder', async () => {
    const exe = await writeStub(join(work, 'agent.exe'), 'exe');
    const winsw = await writeStub(join(work, 'WinSW-x64.exe'), 'winsw');
    await mkdir(join(work, 'out'), { recursive: true });

    await expect(
      assembleAgentPackage({
        exePath: exe,
        winswPath: winsw,
        outDir: join(work, 'out'),
        version: '1.0.0',
      }),
    ).rejects.toThrow(/มีอยู่แล้ว/);
  });

  it('lays out every file of the package', async () => {
    const exe = await writeStub(join(work, 'agent.exe'), 'exe-bytes');
    const winsw = await writeStub(join(work, 'WinSW-x64.exe'), 'winsw-bytes');

    const outDir = join(work, 'out');
    const res = await assembleAgentPackage({ exePath: exe, winswPath: winsw, outDir, version: '1.2.3' });

    expect(res.files).toEqual([...PACKAGE_FILES]);
    const onDisk = (await readdir(outDir)).sort();
    expect(onDisk).toEqual([...PACKAGE_FILES].sort());

    // The wrapper must sit next to its own XML with the same base name.
    const serviceXml = await readFile(join(outDir, 'NN-LRMS-agent-service.xml'), 'utf8');
    expect(serviceXml).toContain('%BASE%\\nn-lrms-agent.exe');

    // VERSION.txt carries the version.
    expect((await readFile(join(outDir, 'VERSION.txt'), 'utf8')).trim()).toBe('1.2.3');

    // SHA256SUMS.txt lists every other file, and the sums match the bytes.
    const sums = (await readFile(join(outDir, 'SHA256SUMS.txt'), 'utf8'))
      .split('\n')
      .filter((l) => l.length > 0);
    expect(sums).toHaveLength(PACKAGE_FILES.length - 1);
    for (const line of sums) {
      const [hash, file] = line.split('  ');
      const bytes = await readFile(join(outDir, file), 'utf8');
      expect(hash).toBe(createHash('sha256').update(new Uint8Array(Buffer.from(bytes))).digest('hex'));
    }
  });

  it('ships the templates the hospital needs', async () => {
    const exe = await writeStub(join(work, 'agent.exe'), 'exe-bytes');
    const winsw = await writeStub(join(work, 'WinSW-x64.exe'), 'winsw-bytes');
    const outDir = join(work, 'out');
    await assembleAgentPackage({ exePath: exe, winswPath: winsw, outDir, version: '1.0.0' });

    for (const f of TEMPLATE_FILES) {
      const content = await readFile(join(outDir, f), 'utf8');
      expect(content.length).toBeGreaterThan(0);
    }
    // The install guide is the hospital's manual.
    const guide = await readFile(join(outDir, 'INSTALL-GUIDE.html'), 'utf8');
    expect(guide).toContain('NN-LRMS');
  });

  it('explains where to put the WinSW binary', () => {
    expect(winswHint()).toContain('vendor/winsw/WinSW-x64.exe');
  });
});
