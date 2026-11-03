// tests/e2e/helpers/layout-metrics.ts
// Page-level horizontal overflow and leaf text under the 13px floor (Leaflet
// attribution excluded; SVG text has no innerText and is measured separately).
import type { Page } from '@playwright/test';

export interface LayoutMetrics {
  scrollWidth: number;
  clientWidth: number;
  tinyText: string[];
}

export async function measureLayout(page: Page): Promise<LayoutMetrics> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    tinyText: [...document.querySelectorAll('body *')]
      .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
      .filter((el) => !el.closest('.leaflet-container'))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 13)
      .map((el) => `${el.tagName.toLowerCase()}: ${(el as HTMLElement).innerText.trim().slice(0, 40)}`),
  }));
}
