// Shared by the list-page stale-banner tests: after a page has rendered
// cached rows, make every further fetch fail and let the page's own polling
// interval fire (the pages run SWR with a custom cache provider, so focus
// revalidation is not wired — the interval is the real refresh path).
// Call `vi.useFakeTimers({ shouldAdvanceTime: true })` BEFORE rendering.
import { act } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { LIST_PAGE } from '@/config/list-page';

export async function failNextRefresh(fetcher: Mock): Promise<void> {
  fetcher.mockImplementation(async () => {
    throw new Error('network down');
  });
  await act(async () => {
    // slowRefreshMs >= refreshMs: covers every list page's interval.
    await vi.advanceTimersByTimeAsync(LIST_PAGE.slowRefreshMs + 1000);
  });
}
