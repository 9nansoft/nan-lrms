import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { SectionCard } from '@/components/shared/SectionCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiTile } from '@/components/shared/KpiTile';
import { KpiGrid } from '@/components/shared/KpiGrid';

describe('SectionCard', () => {
  it('is a labelled region with title, description and actions', () => {
    render(
      <SectionCard title="ผู้คลอดเสี่ยงสูง" description="เรียงตามคะแนน" actions={<button>ดูทั้งหมด</button>}>
        <p>เนื้อหา</p>
      </SectionCard>,
    );
    expect(screen.getByRole('region', { name: 'ผู้คลอดเสี่ยงสูง' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'ผู้คลอดเสี่ยงสูง' })).toBeInTheDocument();
    expect(screen.getByText('เรียงตามคะแนน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ดูทั้งหมด' })).toBeInTheDocument();
  });
  it('danger tone uses the danger tint', () => {
    render(<SectionCard title="t" tone="danger">x</SectionCard>);
    expect(screen.getByRole('region').className).toContain('bg-danger-tint');
  });
  it('ok tone uses the ok tint and border (the calm "nothing urgent" state)', () => {
    render(<SectionCard title="t" tone="ok">x</SectionCard>);
    const region = screen.getByRole('region');
    expect(region.className).toContain('bg-ok-tint');
    expect(region.className).toContain('border-ok/40');
  });
});

describe('PageHeader', () => {
  it('renders an h1, subtitle and freshness badge', () => {
    render(
      <PageHeader
        title="ภาพรวมจังหวัดน่าน"
        subtitle="ผู้คลอดทุกโรงพยาบาลในจังหวัด"
        freshness={{ lastSyncAt: null }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดน่าน' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ยังไม่เคยซิงค์');
  });
});

describe('KpiTile', () => {
  it('shows a formatted server count with tabular figures', () => {
    render(<KpiTile label="รอคลอด" count={1234} />);
    const value = screen.getByText('1,234');
    expect(value.className).toContain('tabular-nums');
    expect(value.className).toContain('text-kpi');
  });
  it('high tone is the solid danger tile with white text', () => {
    const { container } = render(<KpiTile label="เสี่ยงสูง" count={2} tone="high" />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-danger');
    expect((container.firstChild as HTMLElement).className).toContain('text-white');
  });
  it('href makes the whole tile a link named by label and count', () => {
    render(<KpiTile label="เสี่ยงสูง" count={2} href="/?risk=high" />);
    expect(screen.getByRole('link', { name: 'เสี่ยงสูง 2' })).toHaveAttribute('href', '/?risk=high');
  });
  it.each([NaN, Infinity])('non-finite count %p renders an em dash, not NaN', (n) => {
    render(<KpiTile label="รอคลอด" count={n} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('cn with the design type scale', () => {
  it('keeps a type-scale size alongside a colour class', async () => {
    const { cn } = await import('@/lib/utils');
    expect(cn('text-kpi tabular-nums', 'text-brand')).toBe('text-kpi tabular-nums text-brand');
    expect(cn('text-label', 'text-ok-text')).toBe('text-label text-ok-text');
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
  });
});

describe('KpiTile — sub-project 2', () => {
  it('href + hint: the hint button is a sibling of the link, never inside it', () => {
    render(
      <KpiTile label="เสี่ยงสูง" count={2} href="/x" hint={{ title: 'ความหมาย', body: 'นับจาก…' }} />,
    );
    const link = screen.getByRole('link', { name: 'เสี่ยงสูง 2' });
    const hint = screen.getByRole('button', { name: 'คำอธิบาย: เสี่ยงสูง' });
    expect(link.contains(hint)).toBe(false);
    expect(within(link).queryByRole('button')).toBeNull();
  });
  it('the number never wraps and is tagged for the E2E one-line check', () => {
    render(<KpiTile label="รอคลอด" count={1169} />);
    const value = screen.getByText('1,169');
    expect(value.className).toContain('whitespace-nowrap');
    expect(value).toHaveAttribute('data-kpi-value');
    expect(screen.getByText('รอคลอด')).toHaveAttribute('data-kpi-label');
  });
  it('renders a sub line, a test id on the root, and the ok tone', () => {
    render(<KpiTile label="ส่งต่อ" count={0} tone="ok" sub="ไม่มีส่งต่อค้างเกิน SLA" testId="t" />);
    const root = screen.getByTestId('t');
    expect(root.className).toContain('bg-ok-tint');
    expect(within(root).getByText('ไม่มีส่งต่อค้างเกิน SLA')).toBeInTheDocument();
  });
});

describe('KpiGrid', () => {
  it('uses auto-fit columns with a minimum tile width', () => {
    const { container } = render(
      <KpiGrid>
        <span>a</span>
      </KpiGrid>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('minmax(150px,1fr)');
  });
});

describe('PageHeader freshness label', () => {
  it('passes a custom label to the freshness badge', () => {
    render(
      <PageHeader
        title="ภาพรวมจังหวัดน่าน"
        freshness={{ lastSyncAt: new Date().toISOString(), label: 'ข้อมูลหน้านี้ ณ' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูลหน้านี้ ณ');
  });
});

describe('KpiTile — toggle mode (sub-project 4)', () => {
  it('onSelect makes a stretched pressed-state button; the hint stays a sibling', () => {
    const onSelect = vi.fn();
    render(
      <KpiTile
        label="ครบกำหนดคลอดใน 14 วัน"
        count={172}
        onSelect={onSelect}
        selected={false}
        hint={{ title: 'ใกล้คลอด', body: 'อธิบาย' }}
        testId="kpi-due-soon"
      />,
    );
    const toggle = screen.getByRole('button', { name: 'ครบกำหนดคลอดใน 14 วัน 172' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle.querySelector('button')).toBeNull();
    fireEvent.click(toggle);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /คำอธิบาย/ }).closest('[aria-pressed]')).toBeNull();
  });

  it('selected tile is marked and outlined', () => {
    render(<KpiTile label="HR3" count={3} onSelect={() => {}} selected testId="t" />);
    expect(screen.getByRole('button', { name: 'HR3 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('t')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('t').className).toContain('ring-2');
  });

  it('null / undefined count renders an em dash, not 0', () => {
    render(<KpiTile label="หญิงตั้งครรภ์" count={null} testId="n" />);
    expect(screen.getByTestId('n').querySelector('[data-kpi-value]')!.textContent).toBe('—');
  });
});

describe('SectionCard testId', () => {
  it('puts the test id on the section', () => {
    render(<SectionCard title="เส้นทางส่งต่อหลัก" testId="corridors-panel">x</SectionCard>);
    expect(screen.getByTestId('corridors-panel')).toHaveAttribute('aria-label', 'เส้นทางส่งต่อหลัก');
  });
});

describe('KpiGrid balanced rows', () => {
  const cls = (n: number) => {
    const { container } = render(
      <KpiGrid count={n}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i}>t</span>
        ))}
      </KpiGrid>,
    );
    return (container.firstChild as HTMLElement).className;
  };
  it('5 tiles go 3+2 (never 4+1) and 6 tiles go 3+3 (never 4+2)', () => {
    expect(cls(5)).toContain('grid-cols-3');
    expect(cls(5)).not.toContain('grid-cols-4');
    expect(cls(6)).toContain('grid-cols-3');
    expect(cls(6)).not.toContain('grid-cols-4');
  });
  it('4 tiles go 2x2 or 4x1, never 3+1', () => {
    expect(cls(4)).not.toContain('grid-cols-3');
  });
  it('without a count it keeps the auto-fit behaviour', () => {
    const { container } = render(<KpiGrid min="md"><span>a</span></KpiGrid>);
    expect((container.firstChild as HTMLElement).className).toContain('minmax(200px,1fr)');
  });
});
