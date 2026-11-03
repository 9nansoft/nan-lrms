// The user manual is a static, self-contained page (public/manual.html) so it
// opens without a session and can be printed. These checks pin its contract:
// Thai, NN-LRMS-branded, covers every audience and the end-to-end flow, and
// loads nothing from outside the deployment.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(__dirname, '../../../public/manual.html'), 'utf8');

describe('public/manual.html', () => {
  it('is a Thai NN-LRMS page with a title', () => {
    expect(html).toMatch(/<html[^>]*lang="th"/);
    expect(html).toMatch(/<title>[^<]*คู่มือการใช้งาน NN-LRMS[^<]*<\/title>/);
    expect(html).not.toMatch(/KK-LRMS|ขอนแก่น/);
  });

  it('has a section for each audience and the end-to-end flow', () => {
    for (const id of ['flow', 'start', 'ward', 'provincial', 'it', 'troubleshoot']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('documents the real menu items', () => {
    for (const label of ['แดชบอร์ด', 'ฝากครรภ์', 'โรงพยาบาล', 'ส่งต่อ', 'ผลลัพธ์ทารก', 'ห้องคลอด', 'ตั้งค่า', 'โปรไฟล์']) {
      expect(html).toContain(label);
    }
  });

  it('loads no external scripts, styles or fonts', () => {
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).not.toMatch(/https?:\/\/(?!localhost)[^"'\s]+\.(js|css)/);
  });

  it('links back into the app', () => {
    expect(html).toContain('href="/"');
  });
});
