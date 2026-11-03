// src/config/list-page.ts
// List-page knobs shared by /hospitals, /pregnancies, /referrals, /outcomes
// (UI sub-project 4). Values are the ones the pages already used.
export const LIST_PAGE = {
  /** Rows per page requested from paginated list APIs. */
  perPage: 20,
  /** Search box → API query debounce. */
  searchDebounceMs: 400,
  /** Default list refresh (pregnancies, referrals). */
  refreshMs: 30_000,
  /** Slow-changing aggregates (outcomes, referral insights). */
  slowRefreshMs: 60_000,
} as const;

/** Header freshness label for "when this page's data was fetched" — the
 *  HOSxP sync time lives in the shell StatusStrip (dashboard spec D12). */
export const PAGE_DATA_FRESHNESS_LABEL = 'ข้อมูลหน้านี้ ณ';
