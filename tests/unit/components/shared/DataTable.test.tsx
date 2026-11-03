import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { RiskLevel } from '@/types/domain';

type Row = { an: string; name: string; score: number; risk: RiskLevel };
const rows: Row[] = [
  { an: 'AN1', name: 'นาง ส.', score: 11.5, risk: RiskLevel.HIGH },
  { an: 'AN2', name: 'นาง ก.', score: 2.5, risk: RiskLevel.LOW },
];
const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'ผู้คลอด', cell: (r) => r.name },
  { key: 'score', header: 'คะแนน', cell: (r) => r.score.toFixed(1), numeric: true },
];

describe('DataTable', () => {
  it('renders headers and rows, numeric cells right-aligned with tabular figures', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} caption="ผู้คลอด" />);
    expect(screen.getByRole('table', { name: 'ผู้คลอด' })).toBeInTheDocument();
    const cell = screen.getByText('11.5').closest('td')!;
    expect(cell.className).toContain('text-right');
    expect(cell.className).toContain('tabular-nums');
  });
  it('tints rows by risk', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} rowRisk={(r) => r.risk} />);
    expect(screen.getByText('นาง ส.').closest('tr')!.className).toContain('bg-danger-tint');
    expect(screen.getByText('นาง ก.').closest('tr')!.className).toContain('bg-ok-tint');
  });
  it('loading shows a busy skeleton, not the empty message', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.an} loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('ไม่มีข้อมูล')).not.toBeInTheDocument();
  });
  it('empty rows render the empty slot across all columns', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.an} empty={<span>ยังไม่มีผู้คลอด</span>} />);
    const cell = screen.getByText('ยังไม่มีผู้คลอด').closest('td')!;
    expect(cell).toHaveAttribute('colspan', '2');
  });
  it('clickable rows are named, and activate on click, Enter and Space', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.an}
        onRowClick={onRowClick}
        rowLabel={(r) => `เปิดข้อมูล ${r.name}`}
      />,
    );
    const tr = screen.getByRole('row', { name: 'เปิดข้อมูล นาง ก.' });
    expect(tr).toHaveAttribute('tabindex', '0');
    await userEvent.click(tr);
    tr.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(3);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    // Space must not scroll the page: the handler prevents the default.
    expect(fireEvent.keyDown(tr, { key: ' ' })).toBe(false);
    expect(within(tr).getByText('2.5')).toBeInTheDocument();
  });
  it('non-clickable rows are neither focusable nor labelled', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} />);
    const tr = screen.getByText('นาง ก.').closest('tr')!;
    expect(tr).not.toHaveAttribute('tabindex');
    expect(tr).not.toHaveAttribute('aria-label');
  });
  it('onRowClick without rowLabel does not compile', () => {
    // @ts-expect-error a clickable row must say what it opens
    const bad = <DataTable columns={columns} rows={rows} rowKey={(r) => r.an} onRowClick={() => {}} />;
    expect(bad).toBeTruthy();
  });
  it('maxHeight makes the table its own scroller and only then sticks the header', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} maxHeight={320} />);
    const scroller = container.querySelector('[data-slot="table-container"]') as HTMLElement;
    expect(scroller.style.maxHeight).toBe('320px');
    expect(scroller.className).toContain('overflow-y-auto');
    expect(container.querySelector('thead')!.className).toContain('sticky');
  });
  it('an unbounded table does not claim a sticky header', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} />);
    expect(container.querySelector('thead')!.className).not.toContain('sticky');
  });
  it('row keys ignore events from nested controls', () => {
    const onRowClick = vi.fn();
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'ผู้คลอด', cell: (r) => <button type="button">เปิด {r.an}</button> },
    ];
    render(
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.an} onRowClick={onRowClick} rowLabel={(r) => r.name} />,
    );
    const btn = screen.getByRole('button', { name: 'เปิด AN1' });
    expect(fireEvent.keyDown(btn, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(btn, { key: ' ' })).toBe(true);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('DataTable — list pages (sub-project 4)', () => {
  type R = { id: string; name: string };
  const data: R[] = [{ id: 'a', name: 'รพ.พล' }];
  const cols: DataTableColumn<R>[] = [
    {
      key: 'name',
      header: 'โรงพยาบาล',
      cell: (r) => (
        <span>
          <a href={`/hospitals/${r.id}`} tabIndex={-1}>
            {r.name}
          </a>{' '}
          <span>รหัส {r.id}</span> <button type="button">แก้ไข</button>
        </span>
      ),
    },
  ];

  it('row click ignores clicks on nested links/buttons but not on plain cell text', async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={cols} rows={data} rowKey={(r) => r.id} onRowClick={onRowClick} rowLabel={(r) => `เปิด ${r.name}`} />);
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
    fireEvent.click(screen.getByText('รพ.พล'));
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('รหัส a'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('rowAttrs, isRowSelected and onRowPointerEnter decorate the <tr>', () => {
    const onEnter = vi.fn();
    render(
      <DataTable
        columns={cols}
        rows={data}
        rowKey={(r) => r.id}
        rowAttrs={(r) => ({ 'data-testid': `row-${r.id}`, 'data-sync': 'ok' })}
        isRowSelected={() => true}
        onRowPointerEnter={onEnter}
      />,
    );
    const tr = screen.getByTestId('row-a');
    expect(tr.tagName).toBe('TR');
    expect(tr).toHaveAttribute('data-sync', 'ok');
    expect(tr).toHaveAttribute('data-selected', 'true');
    expect(tr.className).toContain('bg-brand-soft');
    fireEvent.pointerEnter(tr);
    expect(onEnter).toHaveBeenCalledWith(data[0]);
  });

  it('cells wrap instead of forcing the table wider', () => {
    render(<DataTable columns={cols} rows={data} rowKey={(r) => r.id} />);
    expect(screen.getByText('รหัส a').closest('td')!.className).toContain('whitespace-normal');
  });
});
