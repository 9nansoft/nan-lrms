// Pure collision pass for the partograph TIME row labels.
//
// Clinical rule: the MOST RECENT observation's label is always kept (it is the
// one the midwife reads to confirm "when was this last charted"). Older labels
// are dropped when they would overlap a kept one; on-the-hour labels ("HH")
// beat off-hour ones ("HH:mm") when both compete for the same space. Dropped
// times remain on the observation table.

export interface TimeLabelItem {
  id: string | number;
  px: number;
  text: string;
}

/** Approximate glyph width of the 13px tabular label, in SVG px. */
export const TIME_LABEL_CHAR_PX = 7.5;

const halfWidth = (it: TimeLabelItem) => (it.text.length * TIME_LABEL_CHAR_PX) / 2;
const overlaps = (a: TimeLabelItem, b: TimeLabelItem) =>
  Math.abs(a.px - b.px) < halfWidth(a) + halfWidth(b);
/** On-the-hour labels are the short two-digit form. */
const isOnHour = (it: TimeLabelItem) => !it.text.includes(':');

/** Returns the kept labels ordered left to right. */
export function selectTimeLabels(items: readonly TimeLabelItem[]): TimeLabelItem[] {
  // Newest (rightmost) first; the on-the-hour pass is stable within that order.
  const newestFirst = [...items].sort((a, b) => b.px - a.px);
  if (newestFirst.length === 0) return [];
  const kept: TimeLabelItem[] = [newestFirst[0]];
  const rest = newestFirst.slice(1);
  const ordered = [...rest.filter(isOnHour), ...rest.filter((it) => !isOnHour(it))];
  for (const it of ordered) {
    if (kept.every((k) => !overlaps(k, it))) kept.push(it);
  }
  return kept.sort((a, b) => a.px - b.px);
}

/** Lanes for categorical strip values (temperature, urine, …). Unlike the TIME
 *  row nothing may be dropped — every reading is clinical data — so a value
 *  that would overlap the previous one in lane 0 moves to the next free lane
 *  (two readings in one hour cell are drawn one above the other). With more
 *  readings than `maxLanes` in one spot the extra ones reuse lanes round-robin;
 *  they still render, never silently disappear. Returns lanes in input order. */
export function assignLanes(
  items: readonly { px: number; text: string }[],
  maxLanes = 2,
): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].px - items[b].px);
  const lastInLane: ({ px: number; text: string } | undefined)[] = Array(maxLanes).fill(undefined);
  const lanes = new Array<number>(items.length).fill(0);
  order.forEach((idx, rank) => {
    const it = items[idx];
    const free = lastInLane.findIndex(
      (prev) => !prev || Math.abs(prev.px - it.px) >= halfWidth({ id: 0, ...prev }) + halfWidth({ id: 0, ...it }),
    );
    const lane = free === -1 ? rank % maxLanes : free;
    lanes[idx] = lane;
    lastInLane[lane] = it;
  });
  return lanes;
}
