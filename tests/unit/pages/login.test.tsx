import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
const storage = vi.hoisted(() => ({ setSessionCookie: vi.fn(), setMarketplaceToken: vi.fn() }));

vi.mock('next-auth/react', () => ({ signIn: auth.signIn }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.params,
  useParams: () => ({}),
}));
vi.mock('@/utils/bms-session-storage', () => storage);

import LoginPage from '@/app/(auth)/login/page';

function stubPreflight(body: Record<string, unknown> | null) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function submitSession(container: HTMLElement, id: string) {
  await userEvent.type(screen.getByLabelText('BMS Session ID'), id);
  await userEvent.click(container.querySelector('button[type="submit"]')!);
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  auth.signIn.mockReset();
  storage.setSessionCookie.mockReset();
  storage.setMarketplaceToken.mockReset();
  window.localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Login — auth flow characterization (must not change)', () => {
  it('auto-logs in from ?bms-session-id: preflight → signIn → cookie → callbackUrl', async () => {
    nav.params = new URLSearchParams('bms-session-id=abc-123&callbackUrl=/hospital-maternity-ward&marketplace_token=mt');
    const fetchMock = stubPreflight({ ok: true });
    auth.signIn.mockResolvedValue({ error: undefined });
    render(<LoginPage />);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/hospital-maternity-ward'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/hospital-preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'abc-123' }),
    });
    expect(auth.signIn).toHaveBeenCalledWith('credentials', { sessionId: 'abc-123', redirect: false });
    expect(storage.setSessionCookie).toHaveBeenCalledWith('abc-123');
    expect(storage.setMarketplaceToken).toHaveBeenCalledWith('mt');
    expect(window.localStorage.getItem('nn-lrms:auth-provider')).toBe('bms');
  });

  it.each([
    ['https://evil.example/x', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/patients/x', '/patients/x'],
  ])('callbackUrl %s is navigated to as %s (no open redirect)', async (cb, expected) => {
    nav.params = new URLSearchParams({ 'bms-session-id': 'abc', callbackUrl: cb });
    stubPreflight({ ok: true });
    auth.signIn.mockResolvedValue({ error: undefined });
    render(<LoginPage />);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expected));
  });

  it('an empty submit asks for the session id and calls nothing', async () => {
    const fetchMock = stubPreflight({ ok: true });
    const { container } = render(<LoginPage />);
    await userEvent.click(container.querySelector('button[type="submit"]')!);
    expect(await screen.findByText('กรุณากรอก BMS Session ID')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('not_registered names the hospital and who to contact; signIn is never called', async () => {
    stubPreflight({ ok: false, reason: 'not_registered', hospitalCode: '99001', hospitalName: 'รพ.ทดลอง' });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-1');
    expect(await screen.findByText('ไม่ได้รับสิทธิ์ใช้งานระบบ')).toBeInTheDocument();
    expect(screen.getByText('รพ.ทดลอง')).toBeInTheDocument();
    expect(screen.getByText('99001')).toBeInTheDocument();
    expect(screen.getByText(/ติดต่อผู้ดูแลระบบ \(สสจ\.น่าน\)/)).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('deactivated says the hospital was switched off', async () => {
    stubPreflight({ ok: false, reason: 'deactivated', hospitalCode: '10670', hospitalName: 'รพ.น่าน' });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-2');
    expect(await screen.findByText('โรงพยาบาลถูกปิดการใช้งาน')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('hosxp_too_old opens the update dialog with both versions and blocks sign-in', async () => {
    stubPreflight({
      ok: false, reason: 'hosxp_too_old', hospitalCode: '10670', hospitalName: 'รพ.น่าน',
      currentVersion: '1.2.3', minVersion: '2.0.0',
    });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-3');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ต้องอัปเดต HOSxP ก่อนใช้งาน')).toBeInTheDocument();
    expect(within(dialog).getByText('1.2.3')).toBeInTheDocument();
    expect(within(dialog).getAllByText('2.0.0').length).toBeGreaterThanOrEqual(1);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('a malformed preflight reply is a Thai retry message', async () => {
    stubPreflight(null);
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-4');
    expect(await screen.findByText('ไม่สามารถตรวจสอบ session ได้ — กรุณาลองใหม่')).toBeInTheDocument();
  });

  it('an unknown providerError is never the headline; the raw code is detail only', () => {
    nav.params = new URLSearchParams('providerError=<script>evil</script>');
    render(<LoginPage />);
    expect(screen.getByText('เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument();
    expect(screen.getByText('<script>evil</script>')).toBeInTheDocument();
  });

  it('a known providerError maps to friendly Thai', () => {
    nav.params = new URLSearchParams('providerError=access_denied');
    render(<LoginPage />);
    expect(screen.getByText('ท่านไม่ได้อนุญาตให้ระบบเข้าถึงข้อมูล ProviderID กรุณาลองใหม่แล้วกด "อนุญาต"')).toBeInTheDocument();
  });
});

describe('Login — direction-C layout', () => {
  it('has one h1 naming the system', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ระบบติดตามการคลอดจังหวัดน่าน');
  });
  it('offers BMS (HOSxP) as primary and ProviderID as the read-only alternative', () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector('button[type="submit"]')).toHaveTextContent('เข้าสู่ระบบด้วย BMS (HOSxP)');
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย ProviderID' })).toBeInTheDocument();
    expect(screen.getByText('สิทธิ์อ่านอย่างเดียว — ดูข้อมูลได้ แก้ไขไม่ได้')).toBeInTheDocument();
  });
  it('keeps the session field E2E and HOSxP rely on, with Thai help', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('BMS Session ID');
    expect(input).toHaveAttribute('id', 'sessionId');
    expect(input).toHaveAccessibleDescription('เปิด NN-LRMS จากเมนูใน HOSxP ระบบจะกรอกให้อัตโนมัติ');
  });
  it('states the PDPA protection and links to /about', () => {
    render(<LoginPage />);
    expect(
      screen.getByText('ชื่อและเลขบัตรประชาชนผู้ป่วยถูกเข้ารหัสและแสดงแบบปิดบังบางส่วน ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เกี่ยวกับระบบ NN-LRMS' })).toHaveAttribute('href', '/about');
  });
  it('links the user manual before sign-in', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'คู่มือการใช้งาน' })).toHaveAttribute('href', '/manual.html');
  });
  it('the hero illustration is decorative', () => {
    const { container } = render(<LoginPage />);
    const img = container.querySelector('img[src*="login-hero"]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
    expect(img!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('shows that HOSxP auto-login is in progress', async () => {
    nav.params = new URLSearchParams('bms-session-id=abc');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<LoginPage />);
    expect(await screen.findByRole('status')).toHaveTextContent('กำลังเข้าสู่ระบบจาก HOSxP…');
  });
  it('uses no dark slate palette', () => {
    const { container } = render(<LoginPage />);
    expect(container.innerHTML).not.toMatch(/slate-\d/);
  });
});
