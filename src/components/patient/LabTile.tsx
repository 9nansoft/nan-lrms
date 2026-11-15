// One lab result tile. Abnormal tiles use a saturated red treatment so they
// stand out from a row of otherwise unremarkable results.
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

export type LabTileStatus =
  'normal' | 'abnormal' | 'missing' | 'neutral' | 'concealed' | 'unreadable';

const PALETTE: Record<Exclude<LabTileStatus, 'abnormal'>, { fg: string; accent: string; bg: string }> = {
  normal: { fg: 'var(--ink-navy)', accent: 'var(--risk-low)', bg: 'rgba(34, 197, 94, 0.06)' },
  missing: { fg: 'var(--ink-navy-muted)', accent: 'var(--ink-navy-muted)', bg: 'white' },
  neutral: { fg: 'var(--ink-navy)', accent: 'var(--rule-strong)', bg: 'white' },
  concealed: { fg: 'var(--ink-navy-muted)', accent: 'var(--ink-navy-muted)', bg: 'var(--surface-muted)' },
  unreadable: { fg: 'var(--risk-medium-text)', accent: 'var(--risk-medium)', bg: 'var(--risk-medium-tint)' },
};

export function LabTile({
  label,
  value,
  unit,
  status,
  statusLabel,
  testId,
  children,
}: {
  label: string;
  value: string | null;
  unit?: string | null;
  status: LabTileStatus;
  /** Words for the state; shown as the value when there is no value to show. */
  statusLabel?: string | null;
  testId?: string;
  children?: ReactNode;
}) {
  const shown = value ?? statusLabel ?? '—';
  const stateNote = value !== null && statusLabel ? statusLabel : null;
  const unitText = value !== null && unit ? <span className="font-normal"> {unit}</span> : null;

  if (status === 'abnormal') {
    return (
      <div
        data-testid={testId}
        data-status={status}
        className="flex flex-col gap-0.5 border px-2.5 py-1.5 print:break-inside-avoid"
        style={{
          borderColor: 'var(--risk-high)',
          background: 'rgba(239, 68, 68, 0.14)',
          boxShadow: 'inset 3px 0 0 var(--risk-high)',
        }}
      >
        <div
          className="inline-flex items-center gap-1 font-mono text-caption font-bold uppercase tracking-[0.12em]"
          style={{ color: 'var(--risk-high)' }}
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          {label}
        </div>
        <div
          className="inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 font-mono text-caption font-bold tabular-nums text-white"
          style={{ background: 'var(--risk-high)' }}
        >
          {shown}
          {unitText}
        </div>
        {stateNote && (
          <div className="text-caption font-semibold" style={{ color: 'var(--risk-high-text)' }}>
            {stateNote}
          </div>
        )}
        {children}
      </div>
    );
  }
  const palette = PALETTE[status];
  return (
    <div
      data-testid={testId}
      data-status={status}
      className="flex flex-col gap-0.5 border px-2.5 py-1.5 print:break-inside-avoid"
      style={{
        borderColor: 'var(--rule-strong)',
        borderLeftColor: palette.accent,
        borderLeftWidth: 3,
        background: palette.bg,
      }}
    >
      <div className="font-mono text-caption uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
        {label}
      </div>
      <div className="font-mono text-caption font-bold tabular-nums" style={{ color: palette.fg }}>
        {shown}
        {unitText}
      </div>
      {stateNote && (
        <div className="text-caption font-semibold" style={{ color: palette.fg }}>
          {stateNote}
        </div>
      )}
      {children}
    </div>
  );
}
