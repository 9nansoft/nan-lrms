// src/components/patient/detail/format.ts
// Thai date formatting for the patient detail cards (Asia/Bangkok).
export function fmtDateTh(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTimeTh(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

