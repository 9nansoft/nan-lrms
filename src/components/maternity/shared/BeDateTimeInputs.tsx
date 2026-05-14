// Buddhist-Era + 24-hour date / time / datetime inputs.
//
// Native HTML <input type="date" / "datetime-local"> is locked to the
// Gregorian calendar in every browser — there is no locale flag that
// switches the picker to BE. Maternity entry dialogs need BE display
// because that's what HOSxP shows and what nurses verify against the
// paper chart.
//
// Strategy: store ISO Gregorian internally (so onChange handlers, DB
// writes, and HOSxP SQL stay unchanged) but accept + render BE in the
// UI via plain text inputs.
//
// Date format:
//   value (in/out)  YYYY-MM-DD              ISO Gregorian
//   display         D/M/YYYY+543            BE year
//   accepts on type 14/5/2569 · 14/05/2569 · 14-5-2569 · 14.5.2569 · 14/5/69
//                   (2-digit year is parsed as 25xx)
// Time format:
//   value (in/out)  HH:mm                   24h
//   display         HH:mm                   24h
//   accepts on type 9:30 · 09:30 · 0930 · 09.30
// Datetime format:
//   value (in/out)  YYYY-MM-DDTHH:mm        ISO datetime-local
//   display         BE date | 24h time      two inputs side-by-side
//
// All three commit on blur or Enter. Bad input reverts to the current
// value display rather than emitting null (matches what users expect
// from a typed-text field).
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// ─── Date ────────────────────────────────────────────────────────────────

function isoToBE(iso: string): string {
  if (!iso) return '';
  const dateOnly = iso.includes('T') ? iso.split('T')[0] : iso;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateOnly);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return '';
  return `${d}/${mo}/${y + 543}`;
}

function beToISO(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(trimmed);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let yBE = Number(m[3]);
  // 2-digit year → assume current Buddhist century (25xx). The clinic
  // hasn't been issuing 24xx records for a generation; rolling forward
  // means a typed "14/5/69" parses as 2569 BE (= 2026 CE), matching how
  // nurses verbally shorthand the year.
  if (yBE < 100) yBE += 2500;
  if (yBE < 1000) return null;
  const yCE = yBE - 543;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (yCE < 1900 || yCE > 2100) return null;
  return `${String(yCE).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface BeDateInputProps {
  id?: string;
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}

export function BeDateInput({
  id,
  value,
  onChange,
  className,
  disabled,
  readOnly,
  placeholder = 'วว/ดด/ปปปป',
  'aria-label': ariaLabel,
}: BeDateInputProps) {
  const [text, setText] = useState(() => isoToBE(value));

  useEffect(() => {
    setText(isoToBE(value));
  }, [value]);

  const commit = (input: string) => {
    const iso = beToISO(input);
    if (iso === null) {
      // Reject silently — revert to last good display.
      setText(isoToBE(value));
      return;
    }
    if (iso !== value) onChange(iso);
    setText(isoToBE(iso));
  };

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit((e.target as HTMLInputElement).value);
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      maxLength={12}
      className={cn(className)}
    />
  );
}

// ─── Time (24h HH:mm) ─────────────────────────────────────────────────────

function timeNormalize(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  // Accept HH:mm, H:mm, HHmm, HH.mm
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeDisplay(value: string): string {
  if (!value) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export interface BeTimeInputProps {
  id?: string;
  value: string; // 'HH:mm' or 'HH:mm:ss' or ''
  onChange: (hhmm: string) => void;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  'aria-label'?: string;
}

export function BeTimeInput({
  id,
  value,
  onChange,
  className,
  disabled,
  readOnly,
  'aria-label': ariaLabel,
}: BeTimeInputProps) {
  const [text, setText] = useState(() => timeDisplay(value));

  useEffect(() => {
    setText(timeDisplay(value));
  }, [value]);

  const commit = (s: string) => {
    const n = timeNormalize(s);
    if (n === null) {
      setText(timeDisplay(value));
      return;
    }
    if (n !== value) onChange(n);
    setText(timeDisplay(n));
  };

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit((e.target as HTMLInputElement).value);
        }
      }}
      placeholder="HH:mm"
      maxLength={5}
      disabled={disabled}
      readOnly={readOnly}
      className={cn(className)}
    />
  );
}

// ─── Datetime (BE date + 24h time, combined) ──────────────────────────────

function splitDt(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [d, t] = value.split('T');
  return { date: d || '', time: (t || '').slice(0, 5) };
}

export interface BeDateTimeInputProps {
  id?: string;
  value: string; // 'YYYY-MM-DDTHH:mm' or ''
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  'aria-label'?: string;
}

export function BeDateTimeInput({
  id,
  value,
  onChange,
  className,
  disabled,
  readOnly,
  'aria-label': ariaLabel,
}: BeDateTimeInputProps) {
  const { date, time } = splitDt(value);
  const emit = (d: string, t: string) => {
    if (!d) {
      if (value !== '') onChange('');
      return;
    }
    const next = `${d}T${t || '00:00'}`;
    if (next !== value) onChange(next);
  };
  return (
    <div className={cn('flex gap-2', className)}>
      <BeDateInput
        id={id}
        aria-label={ariaLabel ? `${ariaLabel} date` : undefined}
        value={date}
        onChange={(v) => emit(v, time)}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(className, 'flex-1')}
      />
      <BeTimeInput
        aria-label={ariaLabel ? `${ariaLabel} time` : undefined}
        value={time}
        onChange={(v) => emit(date, v)}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(className, 'w-20')}
      />
    </div>
  );
}

// Re-exports for callers that prefer one import path.
export { isoToBE as _isoToBE, beToISO as _beToISO, timeNormalize as _timeNormalize };
