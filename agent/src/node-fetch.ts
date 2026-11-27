// Pure node:http / node:https implementation of fetch() for the Windows
// packaged agent (Node v18.5.0 inside pkg@5.8.1). Avoids Node 18.5.0's
// experimental undici fetch() which emits ExperimentalWarning and throws opaque
// `TypeError: terminated` on transient socket/TLS resets instead of surfacing
// the underlying errno code.
import * as http from 'node:http';
import * as https from 'node:https';
import { URL, URLSearchParams } from 'node:url';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const DEFAULT_SOCKET_TIMEOUT_MS = 90_000;
const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNABORTED',
]);

export interface NodeFetchOptions {
  /** Maximum retries for idempotent GET/HEAD requests on transient transport drops. */
  maxRetries?: number;
  /** Base backoff delay between retries in milliseconds. */
  retryDelayMs?: number;
  /** Socket inactivity timeout in milliseconds. */
  timeoutMs?: number;
}

class NodeHeaders {
  private readonly store = new Map<string, { name: string; value: string }>();

  constructor(init?: HeadersInit) {
    if (!init) return;
    if (Array.isArray(init)) {
      for (const [key, value] of init) this.append(key, value);
    } else if (typeof (init as Headers).forEach === 'function') {
      (init as Headers).forEach((value, key) => this.append(key, value));
    } else {
      for (const [key, value] of Object.entries(init as Record<string, string>)) {
        if (value !== undefined) this.set(key, String(value));
      }
    }
  }

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    const existing = this.store.get(key);
    this.store.set(key, {
      name: existing?.name ?? name,
      value: existing ? `${existing.value}, ${value}` : value,
    });
  }

  delete(name: string): void {
    this.store.delete(name.toLowerCase());
  }

  get(name: string): string | null {
    return this.store.get(name.toLowerCase())?.value ?? null;
  }

  has(name: string): boolean {
    return this.store.has(name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.store.set(name.toLowerCase(), { name, value });
  }

  forEach(callback: (value: string, key: string, parent: Headers) => void, thisArg?: unknown): void {
    for (const [key, entry] of this.store.entries()) {
      callback.call(thisArg, entry.value, key, this as unknown as Headers);
    }
  }

  *entries(): IterableIterator<[string, string]> {
    for (const [key, entry] of this.store.entries()) yield [key, entry.value];
  }

  *keys(): IterableIterator<string> {
    for (const key of this.store.keys()) yield key;
  }

  *values(): IterableIterator<string> {
    for (const entry of this.store.values()) yield entry.value;
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  toOutgoingObject(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of this.store.values()) {
      out[entry.name] = entry.value;
    }
    return out;
  }
}

function makeAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function wrapNetworkError(err: unknown): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const code = (original as NodeJS.ErrnoException).code;
  const label = code ? `fetch failed (${code}): ${original.message}` : `fetch failed: ${original.message}`;
  return new TypeError(label, { cause: original });
}

function toBodyBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), 'utf8');
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  throw new TypeError('Unsupported request body type in nodeFetch');
}

function sleepWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(makeAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildResponse(
  status: number,
  statusText: string,
  headers: NodeHeaders,
  url: string,
  redirected: boolean,
  bodyBuffer: Buffer,
): Response {
  const build = (): Response => {
    let bodyUsed = false;
    const consumeText = (): string => {
      bodyUsed = true;
      return bodyBuffer.toString('utf8');
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      url,
      redirected,
      type: 'default',
      headers: headers as unknown as Headers,
      body: null,
      get bodyUsed() {
        return bodyUsed;
      },
      async text() {
        return consumeText();
      },
      async json() {
        return JSON.parse(consumeText());
      },
      async arrayBuffer() {
        bodyUsed = true;
        const copy = new Uint8Array(bodyBuffer.byteLength);
        copy.set(bodyBuffer);
        return copy.buffer;
      },
      async bytes() {
        bodyUsed = true;
        return new Uint8Array(bodyBuffer);
      },
      clone() {
        return build();
      },
    } as unknown as Response;
  };
  return build();
}

function singleHttpRequest(
  url: URL,
  method: string,
  headers: NodeHeaders,
  body: Buffer | undefined,
  redirectMode: RequestRedirect,
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
  redirectCount: number,
  redirected: boolean,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
    if (!transport) {
      reject(new TypeError(`Unsupported protocol: ${url.protocol}`));
      return;
    }

    const reqHeaders = new NodeHeaders(headers as unknown as HeadersInit);
    if (!reqHeaders.has('user-agent')) {
      reqHeaders.set('User-Agent', 'nn-lrms-agent/1.0');
    }
    if (body !== undefined && !reqHeaders.has('content-length')) {
      reqHeaders.set('Content-Length', String(body.byteLength));
    }

    let settled = false;
    let activeRes: http.IncomingMessage | null = null;

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    const finishResolve = (val: Response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(val);
    };
    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const req = transport.request(
      url,
      {
        method,
        headers: reqHeaders.toOutgoingObject(),
      },
      (res) => {
        activeRes = res;
        const status = res.statusCode ?? 0;
        const statusText = res.statusMessage ?? '';
        const location = res.headers.location;

        if (REDIRECT_STATUSES.has(status) && location) {
          res.resume();
          if (redirectMode === 'error') {
            finishReject(new TypeError(`Unexpected redirect response (${status}) for ${url.href}`));
            return;
          }
          if (redirectMode === 'follow') {
            if (redirectCount >= MAX_REDIRECTS) {
              finishReject(new TypeError(`Exceeded maximum redirects (${MAX_REDIRECTS})`));
              return;
            }
            const nextUrl = new URL(location, url);
            const nextHeaders = new NodeHeaders(headers as unknown as HeadersInit);
            if (nextUrl.origin !== url.origin) {
              nextHeaders.delete('authorization');
            }
            const downgradeToGet =
              (status === 301 || status === 302 || status === 303) &&
              method !== 'GET' &&
              method !== 'HEAD';
            const nextMethod = downgradeToGet ? 'GET' : method;
            const nextBody = downgradeToGet ? undefined : body;
            if (downgradeToGet) {
              nextHeaders.delete('content-length');
              nextHeaders.delete('content-type');
            }
            cleanup();
            settled = true;
            singleHttpRequest(
              nextUrl,
              nextMethod,
              nextHeaders,
              nextBody,
              redirectMode,
              signal,
              timeoutMs,
              redirectCount + 1,
              true,
            ).then(resolve, reject);
            return;
          }
        }

        const resHeaders = new NodeHeaders();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) {
            for (const item of v) resHeaders.append(k, item);
          } else {
            resHeaders.set(k, v);
          }
        }

        const chunks: Buffer[] = [];
        let ended = false;

        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          ended = true;
          const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
          finishResolve(buildResponse(status, statusText, resHeaders, url.href, redirected, bodyBuffer));
        });
        res.on('error', (err) => {
          finishReject(wrapNetworkError(err));
        });
        res.on('close', () => {
          if (!ended && !settled && !res.complete) {
            const err = Object.assign(new Error('Response stream terminated prematurely'), {
              code: 'ECONNRESET',
            });
            finishReject(wrapNetworkError(err));
          }
        });
      },
    );

    const onAbort = () => {
      const abortErr = makeAbortError();
      req.destroy();
      activeRes?.destroy();
      finishReject(abortErr);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    req.setTimeout(timeoutMs, () => {
      const timeoutErr = Object.assign(new Error(`Socket inactivity timeout after ${timeoutMs}ms`), {
        code: 'ETIMEDOUT',
      });
      req.destroy(timeoutErr);
    });

    req.on('error', (err) => {
      if (signal?.aborted) {
        finishReject(makeAbortError());
        return;
      }
      finishReject(wrapNetworkError(err));
    });

    if (body !== undefined) {
      req.end(body);
    } else {
      req.end();
    }
  });
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name === 'AbortError') return false;
  const cause = (err as { cause?: NodeJS.ErrnoException }).cause;
  const code = cause?.code ?? (err as NodeJS.ErrnoException).code;
  return Boolean(code && RETRYABLE_CODES.has(code));
}

export function createNodeFetch(options: NodeFetchOptions = {}): typeof fetch {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 400;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SOCKET_TIMEOUT_MS;

  return async function nodeFetchImpl(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl);
    const method = (
      init?.method ??
      (typeof input === 'object' && !(input instanceof URL) && 'method' in input
        ? input.method
        : undefined) ??
      'GET'
    ).toUpperCase();

    const headers = new NodeHeaders(
      typeof input === 'object' && !(input instanceof URL) && 'headers' in input
        ? (input.headers as HeadersInit)
        : undefined,
    );
    if (init?.headers) {
      const override = new NodeHeaders(init.headers);
      override.forEach((value, key) => headers.set(key, value));
    }

    const body = toBodyBuffer(init?.body);
    const redirectMode = init?.redirect ?? 'follow';
    const signal = init?.signal;
    const retriesAllowed = method === 'GET' || method === 'HEAD' ? maxRetries : 0;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retriesAllowed; attempt++) {
      if (attempt > 0) {
        await sleepWithAbort(retryDelayMs * 2 ** (attempt - 1), signal);
      }
      try {
        return await singleHttpRequest(
          url,
          method,
          headers,
          body,
          redirectMode,
          signal,
          timeoutMs,
          0,
          false,
        );
      } catch (err) {
        lastError = err;
        if (attempt >= retriesAllowed || !isRetryableError(err)) {
          throw err;
        }
      }
    }
    throw lastError;
  };
}

export const nodeFetch = createNodeFetch();

export function installNodeFetch(): typeof fetch {
  // Replace globalThis.fetch with Object.defineProperty so Node 18.5.0's lazy
  // experimental-fetch getter never executes or emits ExperimentalWarning.
  Object.defineProperty(globalThis, 'fetch', {
    value: nodeFetch,
    writable: true,
    configurable: true,
    enumerable: true,
  });
  return nodeFetch;
}
