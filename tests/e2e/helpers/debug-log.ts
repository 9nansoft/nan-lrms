// tests/e2e/helpers/debug-log.ts
// Constitution: E2E must log network, console, UI state and errors per step.
import type { Page, TestInfo } from '@playwright/test';

// URLs are logged without query strings (they can carry session ids / patient
// identifiers) and response bodies are never logged.
function safeUrl(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return '(unparseable url)';
  }
}

const clip = (t: string) => (t.length > 200 ? `${t.slice(0, 200)}…` : t); // PHI hygiene

export function attachDebugLogging(page: Page): string[] {
  const log: string[] = [];
  const stamp = () => new Date().toISOString();
  page.on('console', (m) => log.push(`${stamp()} console.${m.type()}: ${clip(m.text())}`));
  page.on('pageerror', (e) => log.push(`${stamp()} PAGEERROR: ${clip(e.message)}`));
  page.on('requestfailed', (r) => log.push(`${stamp()} REQFAILED ${r.method()} ${safeUrl(r.url())} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) log.push(`${stamp()} ${r.status()} ${r.request().method()} ${safeUrl(r.url())}`);
  });
  return log;
}

export async function flushDebugLog(log: string[], testInfo: TestInfo): Promise<void> {
  await testInfo.attach('debug-log', { body: log.join('\n'), contentType: 'text/plain' });
  console.log(`[e2e:${testInfo.title}]\n${log.join('\n')}`);
}
