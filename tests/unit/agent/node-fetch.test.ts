import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createNodeFetch } from '@/../agent/src/node-fetch';

type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const servers: http.Server[] = [];

async function startServer(handler: RequestHandler): Promise<{ url: string; server: http.Server }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, server };
}

afterEach(async () => {
  while (servers.length > 0) {
    const s = servers.pop();
    if (!s) continue;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
});

describe('agent nodeFetch', () => {
  it('performs GET with case-insensitive response headers and parses JSON', async () => {
    const { url } = await startServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Test-Header': req.headers['x-client-tag'] ?? 'none',
      });
      res.end(JSON.stringify({ ok: true, method: req.method, path: req.url }));
    });

    const fetcher = createNodeFetch({ maxRetries: 0 });
    const res = await fetcher(`${url}/api/check?code=123`, {
      headers: { 'X-Client-Tag': 'agent-v1' },
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-test-header')).toBe('agent-v1');
    expect(await res.json()).toEqual({ ok: true, method: 'GET', path: '/api/check?code=123' });
  });

  it('sends POST JSON with Content-Length and surfaces non-2xx JSON', async () => {
    let capturedContentLength: string | undefined;
    let capturedBody = '';
    const { url } = await startServer((req, res) => {
      capturedContentLength = req.headers['content-length'];
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        capturedBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'api_key_missing_scope' }));
      });
    });

    const payload = JSON.stringify({ agentVersion: '1.0.2' });
    const fetcher = createNodeFetch({ maxRetries: 0 });
    const res = await fetcher(`${url}/api/sync/agent-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: payload,
    });

    expect(capturedContentLength).toBe(String(Buffer.byteLength(payload)));
    expect(capturedBody).toBe(payload);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'api_key_missing_scope' });
  });

  it('follows redirects and strips Authorization across origins', async () => {
    let targetAuth: string | undefined;
    const { url: targetUrl } = await startServer((req, res) => {
      targetAuth = req.headers.authorization;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ landed: true }));
    });
    const { url: originUrl } = await startServer((_req, res) => {
      res.writeHead(302, { Location: `${targetUrl}/final` });
      res.end();
    });

    const fetcher = createNodeFetch({ maxRetries: 0 });
    const res = await fetcher(`${originUrl}/start`, {
      headers: { Authorization: 'Bearer top-secret' },
    });

    expect(res.ok).toBe(true);
    expect(res.redirected).toBe(true);
    expect(targetAuth).toBeUndefined();
    expect(await res.json()).toEqual({ landed: true });
  });

  it('retries GET once after a transient socket drop', async () => {
    let hits = 0;
    const { url } = await startServer((_req, res) => {
      hits += 1;
      if (hits === 1) {
        res.socket?.destroy();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recovered: true }));
    });

    const fetcher = createNodeFetch({ maxRetries: 1, retryDelayMs: 5 });
    const res = await fetcher(`${url}/pastejson`);
    expect(hits).toBe(2);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ recovered: true });
  });

  it('does NOT retry POST on socket reset and attaches underlying cause.code', async () => {
    let hits = 0;
    const { url } = await startServer((_req, res) => {
      hits += 1;
      res.socket?.destroy();
    });

    const fetcher = createNodeFetch({ maxRetries: 2, retryDelayMs: 5 });
    let caught: unknown;
    try {
      await fetcher(`${url}/push`, { method: 'POST', body: '{}' });
    } catch (err) {
      caught = err;
    }

    expect(hits).toBe(1);
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toContain('ECONNRESET');
    expect((caught as { cause?: { code?: string } }).cause?.code).toBe('ECONNRESET');
  });

  it('rejects with DOMException(AbortError) when AbortSignal fires', async () => {
    const { url } = await startServer((_req, _res) => {
      // keep open until client aborts
    });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const fetcher = createNodeFetch({ maxRetries: 0 });

    await expect(fetcher(`${url}/slow`, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
