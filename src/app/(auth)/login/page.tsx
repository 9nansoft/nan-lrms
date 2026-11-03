// Login — direction-C hero (sub-project 5; approved mockup
// .superpowers/brainstorm/1437805-1791700719/content/assets-in-context.html).
// The auth flow — preflight → signIn → session cookie → callbackUrl — is
// unchanged and pinned by tests/unit/pages/login.test.tsx.
'use client';

import { sanitizeCallbackUrl } from '@/lib/safe-callback-url';
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/shared/BrandMark';
import { LoginHero } from '@/components/auth/LoginHero';
import { AccessDeniedNotice, type AccessDeniedInfo } from '@/components/auth/AccessDeniedNotice';
import { HosxpVersionDialog, type VersionRejection } from '@/components/auth/HosxpVersionDialog';
import { MIN_BMS_API_VERSION } from '@/lib/bms-version';
import { mapProviderError, providerLoginStartUrl } from '@/lib/provider-login';
import { setSessionCookie, setMarketplaceToken } from '@/utils/bms-session-storage';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<AccessDeniedInfo | null>(null);
  const [versionRejection, setVersionRejection] = useState<VersionRejection | null>(null);
  const [loading, setLoading] = useState(false);
  const autoLoginAttempted = useRef(false);

  const callbackUrl = sanitizeCallbackUrl(searchParams.get('callbackUrl'));
  const bmsSessionId = searchParams.get('bms-session-id');
  const providerError = searchParams.get('providerError');
  const mappedProviderError = providerError ? mapProviderError(providerError) : null;
  const marketplaceToken =
    searchParams.get('marketplace_token') ?? searchParams.get('marketplace-token');


  // Auto-login when bms-session-id is in the URL
  useEffect(() => {
    if (bmsSessionId && !autoLoginAttempted.current) {
      autoLoginAttempted.current = true;
      setSessionId(bmsSessionId);
      doLogin(bmsSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bmsSessionId]);

  async function doLogin(id: string) {
    setLoading(true);
    setError(null);
    setAccessDenied(null);
    setVersionRejection(null);

    try {
      const trimmed = id.trim();

      // Preflight: differentiate "bad session" from "hospital not registered"
      // BEFORE NextAuth swallows the rejection reason into a generic
      // CredentialsSignin error. The endpoint is public (no auth needed).
      const preflightRes = await fetch('/api/auth/hospital-preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: trimmed }),
      });
      const preflight = (await preflightRes.json().catch(() => null)) as {
        ok: boolean;
        reason?:
        | 'invalid_session'
        | 'not_registered'
        | 'deactivated'
        | 'invalid_request'
        | 'hosxp_too_old';
        hospitalCode?: string;
        hospitalName?: string;
        currentVersion?: string;
        minVersion?: string;
        message?: string;
      } | null;

      if (!preflight) {
        setError('ไม่สามารถตรวจสอบ session ได้ — กรุณาลองใหม่');
        return;
      }

      if (!preflight.ok) {
        if (preflight.reason === 'not_registered' || preflight.reason === 'deactivated') {
          setAccessDenied({
            reason: preflight.reason,
            hospitalCode: preflight.hospitalCode ?? '',
            hospitalName: preflight.hospitalName ?? '',
            message: preflight.message ?? '',
          });
        } else if (preflight.reason === 'hosxp_too_old') {
          // Modal blocks access until the user dismisses it; the inline
          // error keeps the message visible after dismissal so support
          // staff reviewing a screenshot can still see why login failed.
          const minVersion = preflight.minVersion ?? MIN_BMS_API_VERSION;
          const detail =
            preflight.message ??
            `กรุณาอัปเดต HOSxP เป็นเวอร์ชัน ${minVersion} ขึ้นไปก่อนเข้าใช้งาน`;
          setVersionRejection({
            hospitalCode: preflight.hospitalCode ?? '',
            hospitalName: preflight.hospitalName ?? '',
            currentVersion: preflight.currentVersion ?? null,
            minVersion,
            message: detail,
          });
          setError(detail);
        } else {
          setError(preflight.message ?? 'Session ID ไม่ถูกต้องหรือหมดอายุ');
        }
        return;
      }

      const result = await signIn('credentials', {
        sessionId: trimmed,
        redirect: false,
      });

      if (result?.error) {
        // Should be rare — preflight passed but signIn failed (race condition
        // where hospital was deactivated between preflight and signIn, or BMS
        // session expired in the same window).
        setError('Session ID ไม่ถูกต้องหรือหมดอายุ');
      } else {
        // Persist the BMS session + marketplace token so BmsSessionProvider
        // (in the hospital layout) can hydrate on the next page. The middleware
        // strips bms-session-id from the callbackUrl, so the cookie is the
        // only surviving channel.
        setSessionCookie(trimmed);
        if (marketplaceToken) setMarketplaceToken(marketplaceToken);
        window.localStorage.setItem('nn-lrms:auth-provider', 'bms');
        router.push(callbackUrl);
      }
    } catch (err) {
      // Preserve the real cause: without this the failure is invisible and
      // support cannot tell a network drop from a JSON/parse error.
      console.error('[login] sign-in failed', err);
      const detail = err instanceof Error ? err.message : '';
      setError(`เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่${detail ? ` (${detail})` : ''}`);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId.trim()) {
      setError('กรุณากรอก BMS Session ID');
      return;
    }
    doLogin(sessionId);
  };

  const handleProviderLogin = () => {
    window.location.href = providerLoginStartUrl(callbackUrl);
  };

  const autoLoggingIn = Boolean(bmsSessionId) && loading;

  return (
    <div className="grid min-h-screen bg-surface-page md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-center px-6 py-10 md:px-10">
        <div className="mx-auto w-full max-w-md space-y-6">
          <header className="space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-body-lg font-bold text-brand">NN-LRMS</span>
            </div>
            <h1 className="text-page text-brand">
              ระบบติดตามการคลอด
              <br />
              จังหวัดน่าน
            </h1>
            <p className="text-body text-ink-muted">
              เห็นผู้คลอดทุกโรงพยาบาลในจังหวัดแบบเรียลไทม์ ประเมินความเสี่ยง CPD และประสานส่งต่อได้ทันที
            </p>
          </header>

          {autoLoggingIn && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-brand-soft px-4 py-3 text-body text-brand">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              กำลังเข้าสู่ระบบจาก HOSxP…
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="sessionId" className="text-label text-ink">
                BMS Session ID
              </label>
              <Input
                id="sessionId"
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="กรอก Session ID จาก BMS"
                disabled={loading}
                autoFocus
                aria-describedby="sessionId-help"
                className="h-12 rounded-xl border-border bg-surface-card font-mono focus-visible:border-brand focus-visible:ring-brand"
              />
              <p id="sessionId-help" className="text-caption text-ink-muted">
                เปิด NN-LRMS จากเมนูใน HOSxP ระบบจะกรอกให้อัตโนมัติ
              </p>
            </div>

            {accessDenied && <AccessDeniedNotice info={accessDenied} />}

            {!accessDenied && (error || mappedProviderError) && (
              <div role="alert" className="rounded-xl border border-danger/40 bg-danger-tint p-3 text-body text-danger-text">
                {error ? (
                  error
                ) : mappedProviderError ? (
                  <>
                    <div>{mappedProviderError.message}</div>
                    {mappedProviderError.detail && (
                      <div className="mt-1 break-words text-caption">{mappedProviderError.detail}</div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-brand text-body font-semibold text-white hover:bg-brand-strong"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  กำลังตรวจสอบ…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  เข้าสู่ระบบด้วย BMS (HOSxP)
                </span>
              )}
            </Button>
          </form>

          <div aria-hidden="true" className="flex items-center gap-3 text-caption text-ink-muted">
            <span className="h-px flex-1 bg-border" />
            หรือ
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleProviderLogin}
              className="h-12 w-full rounded-xl border-brand/30 bg-surface-card text-body font-semibold text-brand hover:bg-brand-soft"
            >
              เข้าสู่ระบบด้วย ProviderID
            </Button>
            <p className="text-center text-caption text-ink-muted">สิทธิ์อ่านอย่างเดียว — ดูข้อมูลได้ แก้ไขไม่ได้</p>
          </div>

          <p className="flex items-start gap-2 text-caption text-ink-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            ชื่อและเลขบัตรประชาชนผู้ป่วยถูกเข้ารหัสและแสดงแบบปิดบังบางส่วน ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
          </p>
          <p className="text-caption text-ink-muted">
            <Link href="/about" className="font-medium text-brand underline-offset-4 hover:underline">
              เกี่ยวกับระบบ NN-LRMS
            </Link>{' '}
            · สำนักงานสาธารณสุขจังหวัดน่าน
          </p>
        </div>
      </div>

      <LoginHero />
      <HosxpVersionDialog rejection={versionRejection} onClose={() => setVersionRejection(null)} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
