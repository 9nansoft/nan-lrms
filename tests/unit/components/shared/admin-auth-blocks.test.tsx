// tests/unit/components/shared/admin-auth-blocks.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionCard } from '@/components/shared/SectionCard';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { BrandMark } from '@/components/shared/BrandMark';

describe('SectionCard id', () => {
  it('puts the id on the section so in-page anchors resolve', () => {
    render(<SectionCard id="cpd" title="ระบบประเมินความเสี่ยง CPD">x</SectionCard>);
    expect(screen.getByRole('region', { name: 'ระบบประเมินความเสี่ยง CPD' })).toHaveAttribute('id', 'cpd');
  });
  it('renders no id when none is given', () => {
    render(<SectionCard title="t">x</SectionCard>);
    expect(screen.getByRole('region', { name: 't' })).not.toHaveAttribute('id');
  });
});

describe('DataTable — nested controls own their clicks', () => {
  type Row = { id: string; name: string };
  const rows: Row[] = [{ id: 'a', name: 'รพ.น่าน' }];
  it('a click on a nested button does not also activate the row', async () => {
    const onRowClick = vi.fn();
    const onEdit = vi.fn();
    const columns: DataTableColumn<Row>[] = [
      { key: 'name', header: 'ชื่อ', cell: (r) => r.name },
      { key: 'act', header: 'จัดการ', cell: () => <button type="button" onClick={onEdit}>แก้ไข</button> },
    ];
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} rowLabel={(r) => `เปิด ${r.name}`} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('รพ.น่าน'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

describe('InlineNotice', () => {
  it('announces politely in the ok tone', () => {
    render(<InlineNotice tone="ok">บันทึกสำเร็จ</InlineNotice>);
    const n = screen.getByRole('status');
    expect(n).toHaveTextContent('บันทึกสำเร็จ');
    expect(n.className).toContain('bg-ok-tint');
    expect(n.className).toContain('text-ok-text');
  });
});

describe('BrandMark', () => {
  it('is decorative and brand-filled on light surfaces by default', () => {
    const { container } = render(<BrandMark />);
    const mark = container.firstElementChild!;
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveTextContent('K');
    expect(mark.className).toContain('bg-brand');
  });
  it('inverts on the brand sidebar', () => {
    const { container } = render(<BrandMark tone="onBrand" size="sm" />);
    expect(container.firstElementChild!.className).toContain('bg-white');
    expect(container.firstElementChild!.className).toContain('h-8');
  });
});
