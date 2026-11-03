import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapStatusLegend } from '@/components/dashboard/MapStatusLegend';

describe('MapStatusLegend', () => {
  it('light mode is Thai', () => {
    render(<MapStatusLegend mode="light" />);
    const legend = screen.getByLabelText('คำอธิบายสีจุดสถานะบนแผนที่');
    expect(legend).toHaveTextContent('สถานะการเชื่อมต่อ');
    expect(legend).toHaveTextContent('ออนไลน์');
    expect(legend).toHaveTextContent('ระงับการซิงค์');
    expect(legend).not.toHaveTextContent('ONLINE');
  });
  it('kiosk mode keeps its English legend', () => {
    render(<MapStatusLegend mode="kiosk" />);
    const legend = screen.getByLabelText('Map dot color legend');
    expect(legend).toHaveTextContent('STATUS DOT');
    expect(legend).toHaveTextContent('ONLINE');
    expect(legend).toHaveTextContent('ยังไม่ sync');
  });
  it('light mode sits in normal flow below the map, never absolutely over the markers', () => {
    render(<MapStatusLegend mode="light" />);
    const legend = screen.getByLabelText('คำอธิบายสีจุดสถานะบนแผนที่');
    expect(legend.style.position).not.toBe('absolute');
    expect(legend.className).not.toMatch(/(^|\s)absolute(\s|$)/);
    expect(legend.className).toMatch(/flex-wrap/);
  });
  it('kiosk keeps the overlay in the map corner', () => {
    render(<MapStatusLegend mode="kiosk" />);
    expect(screen.getByLabelText('Map dot color legend').className).toMatch(/(^|\s)absolute(\s|$)/);
  });
});
