import { describe, it, expect } from 'vitest';
import { assignLanes, selectTimeLabels, TIME_LABEL_CHAR_PX, type TimeLabelItem } from '@/components/maternity/partograph/time-labels';

const HOUR_W = 30; // px per hour in the chart
const at = (startHour: number, minutes: number, id: number): TimeLabelItem => {
  const total = startHour * 60 + minutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const hh = String(h).padStart(2, '0');
  return { id, px: (total / 60) * HOUR_W, text: m === 0 ? hh : `${hh}:${String(m).padStart(2, '0')}` };
};
const series = (stepMin: number, count: number, startHour = 8): TimeLabelItem[] =>
  Array.from({ length: count }, (_, i) => at(startHour, i * stepMin, i));

const noOverlap = (kept: TimeLabelItem[]) => {
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1];
    const b = kept[i];
    const gap = b.px - a.px;
    expect(gap).toBeGreaterThanOrEqual(((a.text.length + b.text.length) * TIME_LABEL_CHAR_PX) / 2);
  }
};

describe('selectTimeLabels', () => {
  it.each([15, 30, 10, 5])('dense %i-minute cluster always keeps the newest label', (step) => {
    for (const count of [3, 7, 12, 25]) {
      const items = series(step, count);
      const newest = items[items.length - 1];
      const kept = selectTimeLabels(items);
      expect(kept.map((k) => k.id)).toContain(newest.id);
    }
  });

  it('15-minute off-hour newest survives even when an on-hour label is adjacent', () => {
    // 08, 08:15, 08:30, 08:45, 09, 09:15 -> newest is 09:15
    const items = series(15, 6);
    const kept = selectTimeLabels(items);
    expect(kept[kept.length - 1].text).toBe('09:15');
  });

  it('on-the-hour beats an off-hour label it collides with', () => {
    const hour = at(10, 0, 1);
    const off = at(10, 10, 2); // 5px away: collides
    const newest = at(12, 0, 3);
    const kept = selectTimeLabels([off, hour, newest]);
    expect(kept.map((k) => k.id)).toEqual([1, 3]);
  });

  it('on-the-hour still wins when the off-hour label is newer (but not the newest overall)', () => {
    const hour = at(10, 0, 1);
    const off = at(10, 10, 2);
    const newest = at(14, 0, 3);
    expect(selectTimeLabels([hour, off, newest]).map((k) => k.id)).toEqual([1, 3]);
  });

  it('the newest label wins even over an on-the-hour one that collides with it', () => {
    const hour = at(10, 0, 1);
    const newestOff = at(10, 10, 2);
    const kept = selectTimeLabels([hour, newestOff]);
    expect(kept.map((k) => k.id)).toEqual([2]);
  });

  it('kept labels never overlap and are ordered left to right', () => {
    for (const step of [5, 10, 15, 30, 45, 60]) {
      const kept = selectTimeLabels(series(step, 30));
      expect(kept.map((k) => k.px)).toEqual([...kept.map((k) => k.px)].sort((a, b) => a - b));
      noOverlap(kept);
    }
  });

  it('empty input and a single label', () => {
    expect(selectTimeLabels([])).toEqual([]);
    expect(selectTimeLabels([at(9, 0, 1)])).toHaveLength(1);
  });
});

describe('assignLanes (categorical strips: every reading stays visible)', () => {
  const item = (id: number, px: number, text = '36.8') => ({ id, px, text });

  it('two readings in the same hour cell go to different lanes', () => {
    expect(assignLanes([item(1, 100), item(2, 100)])).toEqual([0, 1]);
  });

  it('readings an hour or more apart all stay in lane 0', () => {
    expect(assignLanes([item(1, 100), item(2, 130), item(3, 160)])).toEqual([0, 0, 0]);
  });

  it('a hot reading is never dropped — it gets a lane like any other', () => {
    const lanes = assignLanes([item(1, 100, '36.8'), item(2, 100, '38.4'), item(3, 160, '37.0')]);
    expect(lanes).toHaveLength(3);
    expect(lanes[0]).not.toBe(lanes[1]);
  });

  it('kept items in the same lane never overlap for two readings per cell', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i, 100 + Math.floor(i / 2) * 30));
    const lanes = assignLanes(items);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (lanes[i] !== lanes[j]) continue;
        expect(Math.abs(items[i].px - items[j].px)).toBeGreaterThanOrEqual(items[i].text.length * TIME_LABEL_CHAR_PX);
      }
    }
  });
});
