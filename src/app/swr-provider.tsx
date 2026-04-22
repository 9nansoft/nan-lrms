// SWR global provider with 30s deduping interval
'use client';

import { SWRConfig } from 'swr';

// Throw on non-2xx so SWR populates `error` instead of handing components a
// 500 body typed as success data. Carries the HTTP status + parsed error
// message so the UI can render a real reason ("column X does not exist")
// instead of a silent empty state.
class FetchError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.body = body;
  }
}

async function fetcher(url: string): Promise<unknown> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string')
        ? (body as { error: string }).error
        : `${res.status} ${res.statusText || 'Request failed'}`;
    throw new FetchError(res.status, message, body);
  }
  return body;
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 30000,
        revalidateOnFocus: true,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
