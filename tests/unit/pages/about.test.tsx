import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import AboutPage from '@/app/about/page';
import { NAN_HOSPITALS } from '@/config/hospitals';
import { CPD_FACTOR_WEIGHTS, RISK_LEVELS } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';
import { maskCid, maskName } from '@/lib/pii-mask';

describe('About page', () => {
  it('has one h1; the header art is decorative', () => {
    const { container } = render(<AboutPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const art = container.querySelector('img[src*="about-header"]');
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute('alt', '');
    expect(art!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('never presents the header art as a map or geography', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-header').textContent).not.toMatch(/แผนที่|ภูมิศาสตร์|map/i);
  });
  it('the table of contents links to every section card', () => {
    render(<AboutPage />);
    const links = within(screen.getByRole('navigation', { name: 'สารบัญ' })).getAllByRole('link');
    expect(links).toHaveLength(9);
    for (const a of links) {
      const id = a.getAttribute('href')!.replace('#', '');
      expect(document.getElementById(id)?.tagName).toBe('SECTION');
    }
  });
  it('facts come from config, not literals', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('fact-hospitals')).toHaveTextContent(String(NAN_HOSPITALS.length));
    expect(screen.getByTestId('fact-cpd-factors')).toHaveTextContent(String(Object.keys(CPD_FACTOR_WEIGHTS).length));
  });
  it('risk levels render labels and ranges from RISK_LEVELS', () => {
    render(<AboutPage />);
    for (const level of [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH]) {
      expect(screen.getAllByText(RISK_LEVELS[level].labelTh).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText(`${RISK_LEVELS[RiskLevel.HIGH].minScore} ขึ้นไป`)).toBeInTheDocument();
  });
  it('static tables use the shared DataTable', () => {
    render(<AboutPage />);
    expect(screen.getByRole('table', { name: 'ปัจจัยเสี่ยง CPD' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'กลุ่มผู้ใช้งาน' })).toBeInTheDocument();
  });
  it('the PDPA copy matches what the app does (masked names, ProviderID read-only)', () => {
    render(<AboutPage />);
    expect(screen.queryByText(/ไม่แสดงชื่อ-สกุล/)).toBeNull();
    expect(screen.getByText(/แสดงชื่อแบบย่อ/)).toBeInTheDocument();
    expect(screen.getAllByText(/ProviderID \(สิทธิ์อ่านอย่างเดียว\)/).length).toBeGreaterThanOrEqual(1);
  });
  it('the masking examples in the copy are exactly what the real maskers produce', () => {
    const { container } = render(<AboutPage />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain(`(เช่น ${maskName('สมหญิง ขจรศักดิ์')})`);
    expect(text).toContain(`(เช่น ${maskCid('3320500282121')})`);
    expect(maskName('สมหญิง ขจรศักดิ์')).toBe('สมหญิง ข.');
    expect(maskCid('3320500282121')).toBe('3XXXXXXXX2121');
  });
  it('about-tables stays a client module and the server page never imports DataTable directly (build fix)', () => {
    const tables = readFileSync('src/components/about/about-tables.tsx', 'utf8');
    const page = readFileSync('src/app/about/page.tsx', 'utf8');
    expect(tables.trimStart().startsWith("'use client'")).toBe(true);
    expect(page).not.toMatch(/import[^;]*DataTable[^;]*from/);
    expect(page).toMatch(/from '@\/components\/about\/about-tables'/);
  });
  it('uses no categorical or slate palette', () => {
    const { container } = render(<AboutPage />);
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:amber|rose|blue|slate)-\d/);
  });
});
