// The ALL ACTIVE board showed only a wall-clock admit time ("08:28"), which
// tells you nothing about how long she has been there. A woman on the labour
// board for three days is the loudest signal on it — prolonged labour
// clinically, and a discharge/data-entry problem operationally (the รพ.น้ำพอง
// admissions sat for days behind an unchanged admit time). This pins the
// duration rendering, and the สถานะ column that rides beside it.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import type { HighRiskPatient } from '@/components/dashboard/HighRiskPatientList';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const NOW = Date.now();
const ago = (mins: number) => new Date(NOW - mins * 60000).toISOString();

function patient(over: Partial<HighRiskPatient> = {}): HighRiskPatient {
  return {
    an: 'AN001',
    hn: 'HN001',
    name: 'สมศรี ใจดี',
    age: 28,
    gaWeeks: 38,
    cpdScore: 12,
    // HIGH deliberately: the list opens on the HIGH-RISK ONLY tab
    // (useState('high')), so a LOW fixture renders an empty board and every
    // assertion below would fail for the wrong reason.
    riskLevel: 'HIGH',
    hospital: 'รพ.ทดสอบ',
    hcode: '10670',
    admitDate: ago(30),
    deliveredAt: null,
    lastVitalAt: ago(10),
    ...over,
  };
}

function renderList(p: HighRiskPatient) {
  return render(<HighRiskPatientList patients={[p]} />);
}

describe('admit duration', () => {
  it('shows minutes within the first hour', () => {
    renderList(patient({ admitDate: ago(45) }));
    expect(screen.getByText('45น')).toBeInTheDocument();
  });

  it('shows hours and minutes within the first day', () => {
    renderList(patient({ admitDate: ago(5 * 60 + 20) }));
    expect(screen.getByText('5ชม 20น')).toBeInTheDocument();
  });

  it('keeps counting in days past 24h instead of collapsing to a date', () => {
    // This is the whole point: formatRelativeTime would render "6 ส.ค." here
    // and hide that she has been on the board for three days.
    renderList(patient({ admitDate: ago(3 * 24 * 60 + 4 * 60) }));
    expect(screen.getByText('3ว 4ชม')).toBeInTheDocument();
  });

  it('does not render a negative duration when the hospital clock runs ahead', () => {
    // HOSxP clock skew can stamp an admission a few minutes in the future.
    renderList(patient({ admitDate: new Date(NOW + 3 * 60000).toISOString() }));
    expect(screen.getByText('เพิ่งรับ')).toBeInTheDocument();
  });

  it('renders no duration when the admit date is missing', () => {
    renderList(patient({ admitDate: null }));
    expect(screen.queryByText(/^\d+(ชม|ว|น)/)).not.toBeInTheDocument();
  });
});

describe('labour stage column', () => {
  it('shows รอคลอด while she has not delivered', () => {
    renderList(patient({ deliveredAt: null }));
    expect(screen.getByText('รอคลอด')).toBeInTheDocument();
    expect(screen.queryByText('คลอดแล้ว')).not.toBeInTheDocument();
  });

  it('shows คลอดแล้ว once delivered, without removing her from the board', () => {
    renderList(patient({ deliveredAt: ago(60) }));
    expect(screen.getByText('คลอดแล้ว')).toBeInTheDocument();
    // Still listed — this board is "admitted and not discharged", and a
    // postpartum mother still needs watching.
    expect(screen.getByText('AN001')).toBeInTheDocument();
  });
});
