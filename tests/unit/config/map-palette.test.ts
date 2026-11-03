import { describe, it, expect } from 'vitest';
import { COLOR } from '@/config/design-tokens';
import { mapBackground, mapLegendTheme, mapPalette } from '@/config/map-palette';

describe('map palette', () => {
  it('light palette derives every colour from the tokens', () => {
    expect(mapPalette('light')).toEqual({
      boundaryStroke: COLOR.brand,
      boundaryFill: 'rgba(46, 58, 135, 0.06)',
      amphoeStroke: 'rgba(46, 58, 135, 0.18)',
      high: COLOR.riskHigh,
      med: COLOR.riskMedium,
      low: COLOR.riskLow,
      idle: COLOR.inkSubtle,
      pinStroke: COLOR.surfaceCard,
      tooltipBg: COLOR.surfaceCard,
      tooltipInk: COLOR.ink,
    });
  });
  it('kiosk palette is byte-identical to the pre-redesign values (kiosk is frozen)', () => {
    expect(mapPalette('kiosk')).toEqual({
      boundaryStroke: '#6ba7e5',
      boundaryFill: 'rgba(107, 167, 229, 0.08)',
      amphoeStroke: 'rgba(107, 167, 229, 0.18)',
      high: '#e05c5c',
      med: '#e0a03a',
      low: '#4fb58a',
      idle: '#7f8fad',
      pinStroke: '#06121f',
      tooltipBg: '#0b1b2e',
      tooltipInk: '#e6ecf5',
    });
  });
  it('legend and canvas: light from tokens, kiosk unchanged', () => {
    expect(mapLegendTheme('light')).toMatchObject({ ink: COLOR.ink, inkMuted: COLOR.inkMuted, unknown: COLOR.inkSubtle });
    expect(mapLegendTheme('kiosk')).toMatchObject({ ink: '#e6ecf5', pinBorder: '#06121f', unknown: '#94a3b8' });
    expect(mapBackground('light')).toBe('var(--surface-muted)');
    expect(mapBackground('kiosk')).toBe('#06121f');
  });
});
