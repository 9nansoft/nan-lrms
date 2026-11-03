import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { FilterBar, FilterChips, FilterSelect, SearchField } from '@/components/shared/FilterBar';
import { Pagination } from '@/components/shared/Pagination';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { EmptyState } from '@/components/shared/EmptyState';

type R = { id: string; name: string };
const rows: R[] = [
  { id: 'a', name: 'นาง ก.' },
  { id: 'b', name: 'นาง ข.' },
];
const columns = [{ key: 'name', header: 'ผู้ป่วย', cell: (r: R) => r.name }];

describe('ResponsiveTable', () => {
  it('renders the table and the card list, switched by its own container width', () => {
    const { container } = render(
      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="รายชื่อ"
        cardListLabel="รายชื่อ (การ์ด)"
        rowAttrs={(r) => ({ 'data-testid': `row-${r.id}` })}
        renderCard={(r) => <div data-testid={`card-${r.id}`}>{r.name}</div>}
      />,
    );
    const root = container.querySelector('[data-slot="responsive-table"]')!;
    expect(root.className).toContain('@container');
    const tableBox = screen.getByRole('table', { name: 'รายชื่อ' }).closest('[data-view="table"]')!;
    expect(tableBox.className).toContain('hidden');
    expect(tableBox.className).toContain('@min-[880px]:block');
    const cards = screen.getByRole('list', { name: 'รายชื่อ (การ์ด)' });
    expect(cards.className).toContain('@min-[880px]:hidden');
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(2);
    expect(screen.getAllByTestId(/^card-/)).toHaveLength(2);
  });

  it('sm breakpoint uses 560px', () => {
    render(
      <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} caption="t" cardListLabel="c" tableFrom="sm" renderCard={(r) => r.name} />,
    );
    expect(screen.getByRole('table').closest('[data-view="table"]')!.className).toContain('@min-[560px]:block');
  });

  it('an empty list renders the empty state once, not inside both views', () => {
    render(
      <ResponsiveTable
        columns={columns}
        rows={[]}
        rowKey={(r: R) => r.id}
        caption="t"
        cardListLabel="c"
        renderCard={(r: R) => r.name}
        empty={<EmptyState title="ไม่พบข้อมูลฝากครรภ์" />}
      />,
    );
    expect(screen.getAllByText('ไม่พบข้อมูลฝากครรภ์')).toHaveLength(1);
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('FilterBar family', () => {
  it('labels every control in Thai and shows clear only when active', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterBar active={false} onClear={onClear}>
        <SearchField label="ค้นหา" value="" onChange={() => {}} placeholder="ชื่อ / HN" />
        <FilterSelect label="โรงพยาบาล" value="" onChange={() => {}} testId="filter-hospital" options={[{ value: '', label: 'ทุกโรงพยาบาล' }]} />
      </FilterBar>,
    );
    expect(screen.getByRole('group', { name: 'ตัวกรองรายการ' })).toBeInTheDocument();
    // Regex names: a control nested in its <label> may also contribute its value.
    expect(screen.getByRole('searchbox', { name: /ค้นหา/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /โรงพยาบาล/ })).toHaveAttribute('data-testid', 'filter-hospital');
    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).toBeNull();
    rerender(
      <FilterBar active onClear={onClear}>
        <span />
      </FilterBar>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('chips are pressed-state buttons with optional counts and test ids', () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="สถานะ"
        value="INITIATED"
        onChange={onChange}
        options={[
          { value: 'INITIATED', label: 'รอดำเนินการ', count: 125, testId: 'status-INITIATED' },
          { value: 'ARRIVED', label: 'ถึงแล้ว', count: 0, testId: 'status-ARRIVED' },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'สถานะ' });
    const initiated = within(group).getByTestId('status-INITIATED');
    expect(initiated).toHaveAttribute('aria-pressed', 'true');
    expect(within(initiated).getByText('125')).toBeInTheDocument();
    fireEvent.click(within(group).getByTestId('status-ARRIVED'));
    expect(onChange).toHaveBeenCalledWith('ARRIVED');
  });
});

describe('Pagination', () => {
  it('states the range from pagination.total in Thai', () => {
    const onPage = vi.fn();
    render(<Pagination pagination={{ total: 1169, page: 2, perPage: 20, totalPages: 59 }} unit="ราย" onPageChange={onPage} />);
    const nav = screen.getByRole('navigation', { name: 'เปลี่ยนหน้า' });
    expect(nav).toHaveTextContent('แสดง 21–40 จาก 1,169 ราย');
    expect(nav).toHaveTextContent('หน้า 2/59');
    fireEvent.click(screen.getByRole('button', { name: /ถัดไป/ }));
    expect(onPage).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: /ก่อนหน้า/ }));
    expect(onPage).toHaveBeenCalledWith(1);
  });
  it('is hidden on a single page', () => {
    const { container } = render(<Pagination pagination={{ total: 3, page: 1, perPage: 20, totalPages: 1 }} unit="ราย" onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ListPageLayout', () => {
  it('one h1, a page-data freshness label once data arrived, a container root', () => {
    const { container } = render(
      <ListPageLayout title="การส่งต่อ" subtitle="ทั้งจังหวัด" updatedAt={new Date().toISOString()}>
        <p>เนื้อหา</p>
      </ListPageLayout>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/ข้อมูลหน้านี้ ณ/)).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).className).toContain('@container');
  });
  it('omits the freshness badge before the first success (never "ยังไม่เคยซิงค์")', () => {
    render(<ListPageLayout title="การส่งต่อ" updatedAt={null}>x</ListPageLayout>);
    expect(screen.queryByText(/ข้อมูลหน้านี้ ณ/)).toBeNull();
    expect(screen.queryByText(/ยังไม่เคยซิงค์/)).toBeNull();
  });
  it('shows an actionable stale banner with retry', () => {
    const onRetry = vi.fn();
    render(
      <ListPageLayout
        title="ฝากครรภ์ (ANC)"
        updatedAt={new Date().toISOString()}
        stale={{ message: 'การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช', onRetry, refreshSeconds: 30 }}
      >
        x
      </ListPageLayout>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('แสดงข้อมูลเดิมจากแคช');
    expect(alert).toHaveTextContent('ระบบจะลองใหม่อัตโนมัติทุก 30 วินาที');
    fireEvent.click(within(alert).getByRole('button', { name: /ลองใหม่/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
