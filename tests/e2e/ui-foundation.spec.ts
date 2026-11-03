// tests/e2e/ui-foundation.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { attachDebugLogging, flushDebugLog } from './helpers/debug-log';
import { mockBms } from './helpers/mock-bms';
import { measureLayout } from './helpers/layout-metrics';
import { wardScenario } from '../helpers/ward-fixtures';

const TAG = process.env.UI_SNAPSHOT_TAG ?? 'after';
// Only the PHI-free /login screenshots are committed (PUBLIC_OUT). Authenticated
// pages can show patient names / AN / CID, so they go to the gitignored
// e2e-private/ (not test-results/, which Playwright wipes every run) and must
// never be added to git.
const PUBLIC_OUT = 'docs/ui-foundation-screenshots';
const PRIVATE_OUT = 'e2e-private/ui-foundation';
const WIDTHS = [1440, 1024, 768] as const;
const AUTH_ROUTES = ['/', '/pregnancies', '/hospitals', '/referrals', '/outcomes', '/hospital-maternity-ward', '/profile'];
const SESSION = process.env.E2E_BMS_SESSION_ID;
// Dashboard screenshots can show masked names / AN — gitignored e2e-private only.
const DASH_OUT = 'e2e-private/ui-dashboard';

mkdirSync(PUBLIC_OUT, { recursive: true });
mkdirSync(PRIVATE_OUT, { recursive: true });
mkdirSync(DASH_OUT, { recursive: true });

// Ward/patient screenshots show masked names and AN — gitignored e2e-private only.
const WARD_OUT = 'e2e-private/ui-ward';
mkdirSync(WARD_OUT, { recursive: true });
type Scenario = ReturnType<typeof wardScenario>;
const wardSql = (s: Scenario, occupancy: unknown[] = [...s.occupancy]): Array<[string, unknown[]]> => [
  ["is_maternity_ward = 'Y' AND ward_active", [...s.wards]],
  ['FROM bedno b JOIN roomno r', [...s.beds]],
  ['latest_lp.cervical_dilation_cm AS last_cervix_cm', occupancy],
];
const TILES_PER_ROW: Record<(typeof WIDTHS)[number], number> = { 1440: 3, 1024: 2, 768: 2 };

async function login(page: Page, log: string[]) {
  await page.goto('/login');
  await page.fill('input#sessionId', SESSION!);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  log.push(`logged in → ${new URL(page.url()).pathname}`);
}

test.describe('UI foundation', () => {
  test('illustrations are public: unauthenticated request returns 200 image/*', async ({ request }) => {
    const res = await request.get('/illustrations/login-hero.webp', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^image\//);
  });

  test('login page renders in Sarabun with no page errors @snapshot', async ({ page }, testInfo) => {
    const log = attachDebugLogging(page);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/login');
      await expect(page.locator('input#sessionId')).toBeVisible();
      const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      log.push(`body font-family @${w}: ${font}`);
      expect(font.toLowerCase()).toContain('sarabun');
      await page.screenshot({ path: `${PUBLIC_OUT}/${TAG}-login-${w}.png`, fullPage: true });
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('authenticated shell, strip and routes @snapshot', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'set E2E_BMS_SESSION_ID to run authenticated E2E (see tests/e2e/dashboard.spec.ts)');
    const log = attachDebugLogging(page);
    await login(page, log);
    for (const route of AUTH_ROUTES) {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        const freshness = page
          .waitForResponse((r) => r.url().includes('/api/sync/freshness'), { timeout: 20_000 })
          .catch(() => null);
        await page.goto(route);
        const res = await freshness;
        log.push(`${route} @${w}: freshness ${res ? res.status() : 'no request'}`);
        await expect(page.locator('header.sticky')).toBeVisible();
        if (w >= 1024) await expect(page.locator('aside').first()).toBeVisible();
        else await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeVisible();
        const tiny = await page.evaluate(
          () =>
            [...document.querySelectorAll('body *')]
              .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
              // third-party map attribution (Leaflet) is not ours to restyle
              .filter((el) => !el.closest('.leaflet-container'))
              .map((el) => parseFloat(getComputedStyle(el).fontSize))
              .filter((px) => px < 13).length,
        );
        log.push(`${route} @${w}: leaf text elements under 13px = ${tiny}`);
        expect(tiny, `${route} @${w} has text under the 13px floor`).toBe(0);
        await page.screenshot({ path: `${PRIVATE_OUT}/${TAG}-${route.replaceAll('/', '_') || 'root'}-${w}.png`, fullPage: true });
      }
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('kiosk mode hides the shell', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    await page.goto('/');
    await page.evaluate(() => document.documentElement.classList.add('kiosk-mode'));
    await expect(page.locator('aside').first()).toBeHidden();
    await expect(page.locator('header.sticky')).toBeHidden();
    log.push('kiosk-mode: aside + header.sticky hidden');
    await flushDebugLog(log, testInfo);
  });

  test('provincial dashboard: no overflow, KPI numbers on one line, one presence badge @dashboard', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      const dash = page
        .waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard', { timeout: 20_000 })
        .catch(() => null);
      await page.goto('/');
      const res = await dash;
      log.push(`/ @${w}: /api/dashboard ${res ? res.status() : 'no request'}`);
      await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดน่าน' })).toBeVisible();
      const m = await page.evaluate(() => {
        const lines = (el: HTMLElement) =>
          Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const values = [...document.querySelectorAll<HTMLElement>('[data-kpi-value]')];
        const labels = [...document.querySelectorAll<HTMLElement>('[data-kpi-label]')];
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          kpis: values.length,
          wrappedValues: values.filter((el) => lines(el) > 1).map((el) => el.textContent?.trim()),
          overflowingValues: values.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim()),
          tallLabels: labels.filter((el) => lines(el) > 2).map((el) => el.textContent?.trim()),
          presenceBadges: document.querySelectorAll('[data-testid="online-users-badge"]').length,
          twoColumns: getComputedStyle(document.querySelector('[data-testid="province-overview"]')!).position === 'sticky',
        };
      });
      log.push(`/ @${w}: ${JSON.stringify(m)}`);
      expect(m.scrollWidth, `/ @${w} scrolls horizontally`).toBeLessThanOrEqual(m.clientWidth);
      expect(m.kpis).toBeGreaterThan(10);
      expect(m.wrappedValues, `/ @${w} KPI numbers wrapped`).toEqual([]);
      expect(m.overflowingValues, `/ @${w} KPI numbers overflow their tile`).toEqual([]);
      expect(m.tallLabels, `/ @${w} KPI labels over two lines`).toEqual([]);
      expect(m.presenceBadges, `/ @${w} online-users badge count`).toBe(1);
      expect(m.twoColumns).toBe(w === 1440); // container ≥ 1160px only at 1440
      await page.screenshot({ path: `${DASH_OUT}/${TAG}-root-${w}.png`, fullPage: true });
    }

    // The sticky overview panel must stay below the sticky shell header.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('province-overview')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => ({
      headerBottom: document.querySelector('header.sticky')!.getBoundingClientRect().bottom,
      panelTop: document.querySelector('[data-testid="province-overview"]')!.getBoundingClientRect().top,
      scrollY: window.scrollY,
      headerVar: getComputedStyle(document.documentElement).getPropertyValue('--app-header-h'),
    }));
    log.push(`/ @1440 after scroll: ${JSON.stringify(pos)}`);
    expect(pos.scrollY).toBeGreaterThan(0);
    expect(pos.panelTop).toBeGreaterThanOrEqual(pos.headerBottom - 1);
    await page.screenshot({ path: `${DASH_OUT}/${TAG}-root-1440-scrolled.png` });
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('kiosk button enters the frozen kiosk and hides the shell @dashboard', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.getByRole('button', { name: /โหมดจอภาพ/ }).click();
    await expect(page.getByText('PPHO WAR-ROOM')).toBeVisible();
    await expect(page.locator('header.sticky')).toBeHidden();
    await expect(page.locator('aside').first()).toBeHidden();
    log.push('kiosk via button: war-room footer visible, shell hidden');
    await page.screenshot({ path: `${DASH_OUT}/${TAG}-kiosk-1920.png` });
    await page.getByRole('button', { name: 'Exit kiosk mode' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดน่าน' })).toBeVisible();
    log.push('kiosk exit: page heading back');
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('ward board: 3/2/2 tiles per row, no overflow, no tiny text, Thai KPIs @ward', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    const s = wardScenario(Date.now());
    await mockBms(page, { log, sql: wardSql(s) });
    await login(page, log);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/hospital-maternity-ward?bms-session-id=e2e-ward');
      await expect(page.getByRole('heading', { level: 1, name: 'ห้องคลอด' })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('article[data-testid="bed-06"]')).toBeVisible({ timeout: 20_000 });
      const layout = await measureLayout(page);
      const grid = await page.evaluate(() => {
        const tiles = [
          ...document.querySelectorAll<HTMLElement>('[data-testid="ward-room-LR1"] [data-testid="ward-room-grid"] > *'),
        ];
        const top0 = tiles[0].getBoundingClientRect().top;
        return {
          perRow: tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - top0) < 2).length,
          tileWidth: Math.round(tiles[0].getBoundingClientRect().width),
        };
      });
      const prolonged = (await page.getByTestId('ward-kpi-prolonged-latent').locator('[data-kpi-value]').textContent())?.trim();
      log.push(`/hospital-maternity-ward @${w}: ${JSON.stringify({ ...layout, ...grid, prolonged })}`);
      expect(layout.scrollWidth, `ward @${w} scrolls sideways`).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.tinyText, `ward @${w} text under 13px`).toEqual([]);
      expect(grid.perRow, `ward @${w} tiles per row`).toBe(TILES_PER_ROW[w]);
      expect(prolonged).toBe('1');
      await expect(page.locator('article[data-testid="bed-06"]')).toHaveAttribute('data-stage', 'prolongedLatent');
      await page.screenshot({ path: `${WARD_OUT}/${TAG}-ward-${w}.png`, fullPage: true });
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('ward board: empty ward EmptyState and actionable missing-bms_url error @ward', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    const s = wardScenario(Date.now());
    await mockBms(page, { log, sql: wardSql(s, []) });
    await login(page, log);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/hospital-maternity-ward?bms-session-id=e2e-empty');
    await expect(page.getByText('ไม่มีผู้คลอดในห้องคลอดขณะนี้')).toBeVisible({ timeout: 20_000 });
    log.push('empty ward: EmptyState visible');
    await page.screenshot({ path: `${WARD_OUT}/${TAG}-ward-empty-1024.png`, fullPage: true });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockBms(page, { log, sql: wardSql(s), omitBmsUrl: true });
    await page.goto('/hospital-maternity-ward?bms-session-id=e2e-nourl');
    const alert = page.getByRole('alert').filter({ hasText: 'เซสชัน HOSxP' });
    await expect(alert).toContainText('เซสชัน HOSxP ไม่มีที่อยู่เซิร์ฟเวอร์ BMS ของโรงพยาบาล', { timeout: 20_000 });
    await expect(alert).toContainText('วิธีแก้:');
    log.push(`missing bms_url: ${(await alert.textContent())?.slice(0, 160)}`);
    await page.screenshot({ path: `${WARD_OUT}/${TAG}-ward-nourl-1024.png`, fullPage: true });
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('ward board: occupancy HTTP 500 from the first fetch → error state, never "empty" @ward', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    const s = wardScenario(Date.now());
    await mockBms(page, {
      log,
      sql: wardSql(s),
      failSql: [['latest_lp.cervical_dilation_cm AS last_cervix_cm', 500]],
    });
    await login(page, log);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/hospital-maternity-ward?bms-session-id=e2e-occ500');
    const alert = page.getByRole('alert').filter({ hasText: 'ไม่สามารถโหลดข้อมูลห้องคลอดจาก HOSxP' });
    await expect(alert).toContainText('รายชื่อผู้คลอดบนเตียง', { timeout: 20_000 });
    await expect(alert).toContainText('ล้มเหลวตั้งแต่');
    await expect(alert).toContainText('อย่าถือว่าห้องคลอดว่าง');
    await expect(alert.getByRole('button', { name: /ลองใหม่/ })).toBeVisible();
    log.push(`occupancy 500: ${(await alert.textContent())?.slice(0, 200)}`);
    // Nothing on screen may claim the ward is empty or a bed is free.
    for (const copy of ['ไม่มีผู้คลอดในห้องคลอดขณะนี้', 'พร้อมรับผู้คลอด', 'วอร์ดนี้ยังไม่มีเตียงใน HOSxP', 'แสดงข้อมูลเดิม']) {
      await expect(page.getByText(copy)).toHaveCount(0);
    }
    await expect(page.locator('article[data-testid^="bed-"]')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'สรุปเตียงในห้องคลอด' })).toHaveCount(0);
    log.push('occupancy 500: no empty-ward copy, no bed tiles, no KPI row');
    await page.screenshot({ path: `${WARD_OUT}/${TAG}-ward-occupancy-500-1024.png`, fullPage: true });
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('patient detail: no overflow, no zoom, Thai tabs, partograph at native width @ward', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/patients/10670-AN-2026-001');
      await expect(page.getByTestId('patient-header')).toBeVisible({ timeout: 20_000 });
      const ack = page.getByRole('button', { name: 'รับทราบ' });
      if (await ack.isVisible().catch(() => false)) await ack.click(); // HighRiskAlert for the high-risk seed patient
      const layout = await measureLayout(page);
      const zoomed = await page.evaluate(
        () => [...document.querySelectorAll<HTMLElement>('[style]')].filter((el) => el.style.zoom && el.style.zoom !== '1').length,
      );
      log.push(`/patients @${w}: ${JSON.stringify({ ...layout, zoomed })}`);
      expect(layout.scrollWidth, `patient @${w} scrolls sideways`).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.tinyText, `patient @${w} text under 13px`).toEqual([]);
      expect(zoomed).toBe(0);
      await page.screenshot({ path: `${WARD_OUT}/${TAG}-patient-${w}.png`, fullPage: true });

      await page.getByRole('button', { name: /^พาร์โทกราฟ/ }).click();
      const form = page.getByTestId('partograph-form');
      if ((await form.count()) > 0) {
        const box = await form.boundingBox();
        const after = await measureLayout(page);
        log.push(`/patients partograph @${w}: width ${box?.width} · page ${after.scrollWidth}/${after.clientWidth}`);
        expect(box!.width, 'partograph renders at ≥ native width').toBeGreaterThanOrEqual(899);
        expect(after.scrollWidth, 'card scrolls, the page does not').toBeLessThanOrEqual(after.clientWidth);
      } else {
        await expect(page.getByText('ยังไม่มีข้อมูลพาร์โทกราฟสำหรับผู้คลอดรายนี้')).toBeVisible();
        log.push(`/patients partograph @${w}: no partogram in the synthetic seed (EmptyState shown)`);
      }
      await page.screenshot({ path: `${WARD_OUT}/${TAG}-patient-partograph-${w}.png`, fullPage: true });
      await page.getByRole('button', { name: 'สรุป' }).click();
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });
});
