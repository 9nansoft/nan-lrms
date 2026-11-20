// Build the Windows package of the NN-LRMS site agent.
//
//   npm run agent:package
//     -> dist/agent/nn-lrms-agent-<version>-win-x64/   (+ .zip when `zip` exists)
//
// The WinSW service wrapper is NOT in git: put WinSW-x64.exe (official
// release) at vendor/winsw/WinSW-x64.exe before packaging. The script never
// downloads it.
//
// Plain Node (no build step, no bun): the agent exe itself comes from
// `npm run build:agent:win`, which cross-compiles it with esbuild + pkg.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** where the build expects the WinSW binary */
export const WINSW_PATH = 'vendor/winsw/WinSW-x64.exe';

/** every file of a finished package, in this order (SHA256SUMS.txt lists all others) */
export const PACKAGE_FILES = [
  'nn-lrms-agent.exe',
  'NN-LRMS-agent-service.exe',
  'NN-LRMS-agent-service.xml',
  'agent.example.json',
  'check.cmd',
  'install-service.cmd',
  'uninstall-service.cmd',
  'diagnose.cmd',
  'INSTALL-GUIDE.html',
  'VERSION.txt',
  'SHA256SUMS.txt',
];

/** template files copied 1:1 into the package (the other PACKAGE_FILES come from elsewhere) */
export const TEMPLATE_FILES = [
  'NN-LRMS-agent-service.xml',
  'agent.example.json',
  'check.cmd',
  'install-service.cmd',
  'uninstall-service.cmd',
  'diagnose.cmd',
];

/** repo root (tools/ sits one level under it) */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(ROOT, 'agent/package');
const GUIDE = join(ROOT, 'docs/agent-install.html');

const sha256 = async (file) =>
  createHash('sha256').update(new Uint8Array(await readFile(file))).digest('hex');

/** the agent version — one source of truth, shared with the agent itself */
export async function readAgentVersion() {
  const raw = await readFile(join(ROOT, 'agent/version.json'), 'utf8');
  return JSON.parse(raw).version;
}

/** one shared message for the hand-placed WinSW binary */
export const winswHint = () =>
  `หาไม่พบ ${WINSW_PATH} — ดาวน์โหลด WinSW v2.12.0 (WinSW-x64.exe) จากหน้า Releases ทางการของ winsw/winsw เอง` +
  ` แล้ววางไว้ตาม path นั้น (สคริปต์ไม่ดาวน์โหลดให้ และห้าม commit ไฟล์ exe)`;

const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Copy the exe, WinSW (renamed), templates and the guide into outDir; write
 * VERSION.txt + SHA256SUMS.txt.
 */
export async function assembleAgentPackage(opts) {
  const { exePath, winswPath, outDir, version } = opts;

  // WinSW is placed by hand — the script never downloads it and git never holds it
  if (!winswPath || !(await exists(winswPath))) {
    throw new Error(winswHint());
  }
  if (await exists(outDir)) {
    throw new Error(
      `โฟลเดอร์ปลายทางมีอยู่แล้ว: ${outDir} — ลบทิ้งก่อน (สคริปต์ไม่เขียนทับ)`,
    );
  }
  await mkdir(outDir, { recursive: true });

  await copyFile(exePath, join(outDir, 'nn-lrms-agent.exe'));
  // the wrapper must sit next to its config and carry the same base name
  // (WinSW looks up <own name>.xml)
  await copyFile(winswPath, join(outDir, 'NN-LRMS-agent-service.exe'));
  for (const f of TEMPLATE_FILES) await copyFile(join(TEMPLATES, f), join(outDir, f));
  await copyFile(GUIDE, join(outDir, 'INSTALL-GUIDE.html'));
  await writeFile(join(outDir, 'VERSION.txt'), `${version}\n`, 'utf8');

  // "<sha256>  <file>" for every other file, in PACKAGE_FILES order
  const sums = [];
  for (const f of PACKAGE_FILES) {
    if (f === 'SHA256SUMS.txt') continue;
    sums.push(`${await sha256(join(outDir, f))}  ${f}`);
  }
  await writeFile(join(outDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8');

  return { dir: outDir, files: [...PACKAGE_FILES] };
}

/** build the single-file Windows exe (esbuild + pkg, Node runtime embedded) */
function buildWindowsExe() {
  console.log('• npm run build:agent:win (esbuild → pkg, node18-win-x64) …');
  execFileSync(process.execPath, [join(ROOT, 'agent/build-windows.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return join(ROOT, 'agent/dist/agent.exe');
}

/** the CLI: npm run agent:package */
async function main() {
  const version = await readAgentVersion();

  // fast, clear failure before spending time on the cross-compile
  const winswPath = join(ROOT, WINSW_PATH);
  if (!(await exists(winswPath))) {
    console.error(`x ${winswHint()}`);
    process.exit(1);
  }

  const exePath = buildWindowsExe();

  const outDir = join(ROOT, 'dist', 'agent', `nn-lrms-agent-${version}-win-x64`);
  await rm(outDir, { recursive: true, force: true });
  const res = await assembleAgentPackage({ exePath, winswPath, outDir, version });

  // zip when the command exists; otherwise tell the packer how to do it by hand
  let zipPath = null;
  if (existsSync('/usr/bin/zip') || existsSync('/bin/zip')) {
    zipPath = `${outDir}.zip`;
    await rm(zipPath, { force: true });
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: outDir, stdio: 'inherit' });
  }

  const exeSize = (await stat(exePath)).size;
  console.log('✓ แพ็กเสร็จ');
  console.log(`  โฟลเดอร์   : ${res.dir}`);
  console.log(`  ไฟล์       : ${res.files.length} ไฟล์ (ดูรายการ + checksum ใน SHA256SUMS.txt)`);
  console.log(`  ขนาด exe  : ${(exeSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  sha256 exe: ${await sha256(exePath)}`);
  if (zipPath) {
    console.log(`  zip       : ${zipPath}`);
    console.log(`  sha256 zip: ${await sha256(zipPath)}`);
  } else {
    console.log(
      '  (ไม่มีคำสั่ง zip ในเครื่องนี้ — zip โฟลเดอร์เอง: คลิกขวาที่โฟลเดอร์ → Send to → Compressed (zipped) folder)',
    );
  }
}

// `import.meta.main` is bun-only; the CLI runs under node too.
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
