'use client';

// Per-hospital, per-event notification preferences.
// Plan: docs/superpowers/plans/2026-08-07-notification-events.md
//
// Optimistic with revert on error and an actionable Thai message — the same
// contract the single-switch version had (constitution §V).
import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { NAN_HOSPITALS } from '@/config/hospitals';
import { cn } from '@/lib/utils';

interface NotificationEventDto {
  key: string;
  tier: 'urgent' | 'digest';
  detail: 'patient' | 'aggregate';
  labelTh: string;
  descriptionTh: string;
  implemented: boolean;
}

interface PreferenceDto {
  id: string;
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  /** DERIVED server-side from the session hospital — displayed, never sent. */
  detailLevel: 'full' | 'aggregate';
  digestHour: number;
  events: string[];
}

const TIER_LABEL: Record<NotificationEventDto['tier'], string> = {
  urgent: 'แจ้งทันที',
  digest: 'สรุปรายวัน',
};

const HOSPITAL_NAMES = new Map(NAN_HOSPITALS.map((h) => [h.hcode, h.name]));

/** Nurses recognise หน่วยบริการ by name; the code is the fallback, not the label. */
function hospitalLabel(code: string): string {
  const name = HOSPITAL_NAMES.get(code);
  return name ? `${name} (${code})` : `รหัส ${code}`;
}

export function NotificationPreferenceCard() {
  const [ownHospitalCode, setOwnHospitalCode] = useState('');
  const [events, setEvents] = useState<NotificationEventDto[]>([]);
  const [preferences, setPreferences] = useState<PreferenceDto[]>([]);
  const [error, setError] = useState<{ message: string; remedy: string; retry?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addCode, setAddCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/notification-preference');
      if (!res.ok) throw new Error('http');
      const body = (await res.json()) as {
        ownHospitalCode?: unknown;
        events?: unknown;
        preferences?: unknown;
      };
      // Validate at the boundary: a body without these arrays threw inside
      // render and blanked the whole profile page. Failing to load must also
      // never read as "you follow nothing", which would invite the user to
      // re-add hospitals they already follow.
      if (!Array.isArray(body.events) || !Array.isArray(body.preferences)) {
        throw new Error('malformed response');
      }
      setOwnHospitalCode(typeof body.ownHospitalCode === 'string' ? body.ownHospitalCode : '');
      setEvents(body.events as NotificationEventDto[]);
      setPreferences(body.preferences as PreferenceDto[]);
    } catch {
      setError({ message: 'โหลดการตั้งค่าไม่สำเร็จ', remedy: 'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่', retry: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Persist one row. Optimistic: `next` is applied immediately, reverted on failure. */
  async function save(next: PreferenceDto) {
    // subscribersForEvent() ANDs moph_line_enabled into its lookup, and this
    // card has no switch for it. A row left OFF by the old single-switch
    // version would show every box ticked and still deliver nothing, with no
    // way to see why — so bind the flag to the selection: at least one chosen
    // event means "send me LINE for this hospital", none means silence.
    const row: PreferenceDto = { ...next, mophLineEnabled: next.events.length > 0 };
    const previous = preferences;
    setPreferences((rows) =>
      rows.some((r) => r.hospitalCode === row.hospitalCode)
        ? rows.map((r) => (r.hospitalCode === row.hospitalCode ? row : r))
        : [...rows, row],
    );
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/profile/notification-preference', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        // detailLevel is deliberately absent: the server derives it, and
        // sending it would invite a client to ask for patient-level detail at
        // a hospital that is not its own.
        body: JSON.stringify({
          hospitalCode: row.hospitalCode,
          mophLineEnabled: row.mophLineEnabled,
          digestHour: row.digestHour,
          events: row.events,
        }),
      });
      if (!res.ok) throw new Error('http');
      const saved = (await res.json()) as PreferenceDto;
      setPreferences((rows) =>
        rows.some((r) => r.hospitalCode === saved.hospitalCode)
          ? rows.map((r) => (r.hospitalCode === saved.hospitalCode ? saved : r))
          : [...rows, saved],
      );
    } catch {
      setPreferences(previous);
      setError({ message: 'บันทึกไม่สำเร็จ — การตั้งค่ากลับเป็นค่าเดิมแล้ว', remedy: 'ตรวจสอบการเชื่อมต่อ แล้วเลือกอีกครั้ง' });
    } finally {
      setBusy(false);
    }
  }

  async function removeHospital(hospitalCode: string) {
    const previous = preferences;
    setPreferences((rows) => rows.filter((r) => r.hospitalCode !== hospitalCode));
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/profile/notification-preference?hospitalCode=${encodeURIComponent(hospitalCode)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('http');
    } catch {
      setPreferences(previous);
      setError({ message: 'ลบไม่สำเร็จ — ยังติดตามโรงพยาบาลนี้อยู่', remedy: 'ตรวจสอบการเชื่อมต่อ แล้วกด เลิกติดตาม อีกครั้ง' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * A muted row (`mophLineEnabled: false`) delivers nothing regardless of its
   * event children, so its effective subscription is empty. Deriving it here
   * keeps the checkboxes honest — they show what the system will actually do —
   * and makes ticking a box on a muted row re-enable it, which is what the
   * gesture plainly means.
   */
  function effectiveEvents(row: PreferenceDto): string[] {
    return row.mophLineEnabled ? row.events : [];
  }

  function toggleEvent(row: PreferenceDto, key: string) {
    const current = effectiveEvents(row);
    const nextEvents = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    void save({ ...row, events: nextEvents });
  }

  /** New rows start silent: nothing is delivered until an event is ticked. */
  function followHospital(code: string) {
    void save({
      id: '',
      userCid: '',
      hospitalCode: code,
      mophLineEnabled: false,
      detailLevel: code === ownHospitalCode ? 'full' : 'aggregate',
      digestHour: 8,
      events: [],
    });
  }

  const tiers: NotificationEventDto['tier'][] = ['urgent', 'digest'];
  const ownIsFollowed = preferences.some((r) => r.hospitalCode === ownHospitalCode);

  return (
    <SectionCard title="การแจ้งเตือนทาง LINE (MOPH Prompt)" description="เลือกเหตุการณ์ที่ต้องการรับ และโรงพยาบาลที่ต้องการติดตาม">
      <div className="space-y-4">
        {loading && <LoadingState message="กำลังโหลดการตั้งค่า…" className="py-4" />}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-label text-ink-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> กำลังบันทึก…
          </p>
        )}
        {error && (
          <ErrorState
            variant="banner"
            className="rounded-xl border"
            message={error.message}
            remedy={error.remedy}
            onRetry={error.retry ? () => void load() : undefined}
          />
        )}

        {/* Suppressed while an error is showing: "you follow nothing" is a claim
            about saved state we cannot make when the load failed. */}
        {!loading && !error && preferences.length === 0 && (
          <EmptyState
            illustration="generic"
            title="ยังไม่ได้ติดตามโรงพยาบาลใด"
            description="เพิ่มโรงพยาบาลก่อน จึงจะได้รับแจ้งเตือนทาง LINE"
            className="shadow-none"
          />
        )}

        {preferences.map((row) => {
          const isOwn = row.hospitalCode === ownHospitalCode;
          const hasDigest = events.some((e) => e.tier === 'digest' && row.events.includes(e.key));
          return (
            <div key={row.hospitalCode} className="rounded-xl border border-border bg-surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-body-lg text-ink">{hospitalLabel(row.hospitalCode)}</p>
                  {/* Read from the row, not re-derived here: the server decides
                      how much detail a hospital's alerts may carry, and this
                      line is the user's only view of that decision. */}
                  <p
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-0.5 text-caption font-semibold',
                      row.detailLevel === 'full' ? 'bg-ok-tint text-ok-text' : 'bg-surface-muted text-ink-muted',
                    )}
                  >
                    {row.detailLevel === 'full' ? 'โรงพยาบาลของคุณ — แจ้งเตือนระดับผู้ป่วยได้' : 'รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย'}
                  </p>
                </div>
                {!isOwn && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void removeHospital(row.hospitalCode)}
                    disabled={busy}
                    aria-label={`เลิกติดตาม ${row.hospitalCode}`}
                    className="h-9 border-border text-label text-ink-muted hover:text-danger-text"
                  >
                    เลิกติดตาม
                  </Button>
                )}
              </div>

              {tiers.map((tier) => {
                const tierEvents = events.filter((e) => e.tier === tier);
                if (tierEvents.length === 0) return null;
                return (
                  <fieldset key={tier} className="mt-3">
                    <legend className="mb-1 text-label text-ink-muted">{TIER_LABEL[tier]}</legend>
                    {tierEvents.map((e) => (
                      <label key={e.key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          aria-label={e.labelTh}
                          checked={effectiveEvents(row).includes(e.key)}
                          disabled={busy}
                          onChange={() => toggleEvent(row, e.key)}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                        />
                        <span className="text-body text-ink">
                          {e.labelTh}
                          <span className="block text-label text-ink-muted">{e.descriptionTh}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}

              {hasDigest && (
                <label className="mt-3 flex flex-wrap items-center gap-3 text-body text-ink">
                  เวลาส่งสรุปรายวัน
                  <select
                    value={row.digestHour}
                    aria-label="เวลาส่งสรุปรายวัน"
                    disabled={busy}
                    onChange={(ev) => void save({ ...row, digestHour: Number(ev.target.value) })}
                    className="h-11 rounded-lg border border-border bg-surface-card px-3 text-body"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00 น.</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}

        {/* Without this a new user, who has no rows at all, would have to know
            their own 5-digit hospital code to receive anything. */}
        {!loading && ownHospitalCode !== '' && !ownIsFollowed && (
          <Button onClick={() => followHospital(ownHospitalCode)} disabled={busy} className="h-11 bg-brand text-body text-white hover:bg-brand-strong">
            เพิ่มโรงพยาบาลของคุณ ({hospitalLabel(ownHospitalCode)})
          </Button>
        )}

        {/* A picker rather than free text — it cannot produce an invalid code.
            Hospitals that are not yours are stored as 'aggregate'. */}
        <div className="space-y-1.5">
          <label htmlFor="watch-hospital" className="text-label text-ink">
            ติดตามโรงพยาบาลอื่น (จะได้รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="watch-hospital"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              aria-label="เพิ่มโรงพยาบาลที่ต้องการติดตาม"
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-card px-3 text-body"
            >
              <option value="">เลือกโรงพยาบาล…</option>
              {NAN_HOSPITALS.filter((h) => !preferences.some((r) => r.hospitalCode === h.hcode)).map((h) => (
                <option key={h.hcode} value={h.hcode}>{h.name} ({h.hcode})</option>
              ))}
            </select>
            <Button
              disabled={!addCode || busy}
              onClick={() => {
                const code = addCode;
                setAddCode('');
                followHospital(code);
              }}
              className="h-11 bg-brand px-5 text-body text-white hover:bg-brand-strong"
            >
              เพิ่ม
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
