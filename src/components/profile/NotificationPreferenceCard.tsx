'use client';

// Per-hospital, per-event notification preferences.
// Plan: docs/superpowers/plans/2026-08-07-notification-events.md
//
// Optimistic with revert on error and an actionable Thai message — the same
// contract the single-switch version had (constitution §V).
import { useEffect, useState, useCallback } from 'react';
import { KK_HOSPITALS } from '@/config/hospitals';

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
  urgent: 'ทันที',
  digest: 'สรุปรายวัน',
};

const HOSPITAL_NAMES = new Map(KK_HOSPITALS.map((h) => [h.hcode, h.name]));

/** Nurses recognise หน่วยบริการ by name; the code is the fallback, not the label. */
function hospitalLabel(code: string): string {
  const name = HOSPITAL_NAMES.get(code);
  return name ? `${name} (${code})` : `รหัส ${code}`;
}

export function NotificationPreferenceCard() {
  const [ownHospitalCode, setOwnHospitalCode] = useState('');
  const [events, setEvents] = useState<NotificationEventDto[]>([]);
  const [preferences, setPreferences] = useState<PreferenceDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addCode, setAddCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
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
      setError('โหลดการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง');
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
    setError('');
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
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  async function removeHospital(hospitalCode: string) {
    const previous = preferences;
    setPreferences((rows) => rows.filter((r) => r.hospitalCode !== hospitalCode));
    setError('');
    setBusy(true);
    try {
      const res = await fetch(
        `/api/profile/notification-preference?hospitalCode=${encodeURIComponent(hospitalCode)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('http');
    } catch {
      setPreferences(previous);
      setError('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
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
    <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
      <div>
        <p className="font-medium">การแจ้งเตือนทาง LINE (MOPH Prompt)</p>
        <p className="text-xs text-slate-500">
          เลือกเหตุการณ์ที่ต้องการรับ และโรงพยาบาลที่ต้องการติดตาม
        </p>
      </div>

      {loading && <p className="text-xs text-slate-500">กำลังโหลดการตั้งค่า…</p>}
      {busy && <p className="text-xs text-slate-500">กำลังบันทึก…</p>}
      {error && (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}

      {/* Suppressed while an error is showing: "you follow nothing" is a claim
          about saved state we cannot make when the load failed. */}
      {!loading && !error && preferences.length === 0 && (
        <p className="text-xs text-slate-500">
          ยังไม่ได้ติดตามโรงพยาบาลใด — เพิ่มโรงพยาบาลก่อนจึงจะได้รับแจ้งเตือน
        </p>
      )}

      {preferences.map((row) => {
        const isOwn = row.hospitalCode === ownHospitalCode;
        const hasDigest = events.some((e) => e.tier === 'digest' && row.events.includes(e.key));
        return (
          <div key={row.hospitalCode} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{hospitalLabel(row.hospitalCode)}</p>
                <p className="text-xs text-slate-500">
                  {/* Read from the row, not re-derived here: the server decides
                      how much detail a hospital's alerts may carry, and this
                      line is the user's only view of that decision. */}
                  {row.detailLevel === 'full'
                    ? 'โรงพยาบาลของคุณ — แจ้งเตือนระดับผู้ป่วยได้'
                    : 'รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย'}
                </p>
              </div>
              {!isOwn && (
                <button
                  onClick={() => void removeHospital(row.hospitalCode)}
                  disabled={busy}
                  className="text-xs text-slate-500 hover:text-rose-700 disabled:opacity-50"
                  aria-label={`เลิกติดตาม ${row.hospitalCode}`}
                >
                  เลิกติดตาม
                </button>
              )}
            </div>

            {tiers.map((tier) => {
              const tierEvents = events.filter((e) => e.tier === tier);
              if (tierEvents.length === 0) return null;
              return (
                <div key={tier} className="mt-2">
                  <p className="text-[11px] font-semibold text-slate-400">{TIER_LABEL[tier]}</p>
                  {tierEvents.map((e) => (
                    <label key={e.key} className="mt-1 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={e.labelTh}
                        checked={effectiveEvents(row).includes(e.key)}
                        disabled={busy}
                        onChange={() => toggleEvent(row, e.key)}
                        className="mt-1"
                      />
                      <span>
                        {e.labelTh}
                        <span className="block text-xs text-slate-500">{e.descriptionTh}</span>
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}

            {hasDigest && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                เวลาส่งสรุปรายวัน
                <select
                  value={row.digestHour}
                  aria-label="เวลาส่งสรุปรายวัน"
                  disabled={busy}
                  onChange={(ev) => void save({ ...row, digestHour: Number(ev.target.value) })}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 น.
                    </option>
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
        <button
          onClick={() => followHospital(ownHospitalCode)}
          disabled={busy}
          className="rounded bg-teal-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          เพิ่มโรงพยาบาลของคุณ ({hospitalLabel(ownHospitalCode)})
        </button>
      )}

      {/* Restored now that aggregate rendering is enforced end to end: a
          hospital that is not yours is stored as 'aggregate' and its alerts
          arrive without the case reference, the patient name or the deep-link.
          A picker rather than free text — it cannot produce an invalid code. */}
      <div className="space-y-1">
        <label htmlFor="watch-hospital" className="text-xs text-slate-500">
          ติดตามโรงพยาบาลอื่น (จะได้รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย)
        </label>
        <div className="flex items-center gap-2">
          <select
            id="watch-hospital"
            value={addCode}
            onChange={(e) => setAddCode(e.target.value)}
            aria-label="เพิ่มโรงพยาบาลที่ต้องการติดตาม"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">เลือกโรงพยาบาล…</option>
            {KK_HOSPITALS.filter((h) => !preferences.some((r) => r.hospitalCode === h.hcode)).map(
              (h) => (
                <option key={h.hcode} value={h.hcode}>
                  {h.name} ({h.hcode})
                </option>
              ),
            )}
          </select>
          <button
            disabled={!addCode || busy}
            onClick={() => {
              const code = addCode;
              setAddCode('');
              followHospital(code);
            }}
            className="rounded bg-teal-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            เพิ่ม
          </button>
        </div>
      </div>
    </section>
  );
}
