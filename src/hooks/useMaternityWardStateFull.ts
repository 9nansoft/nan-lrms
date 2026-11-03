'use client';
// Clinical-density variant of useMaternityWardState — surfaces BedOccupancyFull
// rows (latest partograph + latest nurse-note joined server-side) for the v2
// bed-tile UI. Same SWR cadence as the lite hook so the kiosk pulse stays
// uniform: ward list 60s, beds 60s, occupancy 20s.
import { useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancyFull,
} from '@/services/maternity-ward';
import type { MaternityWard, BedSlot, BedOccupancyFull } from '@/types/maternity-ward';
import { splitWardOccupants } from '@/services/ward-board';
import type { WardFeed } from '@/lib/actionable-errors';

/**
 * Aggregate live-data health for the masthead badge.
 *  - `ok`           — the beds/occupancy feeds are current (no outstanding error).
 *  - `reconnecting` — a feed errored and SWR is currently re-fetching (retry in flight).
 *  - `error`        — a feed errored and no retry is currently in flight.
 */
export type WardFeedHealth = 'ok' | 'reconnecting' | 'error';

export interface MaternityWardStateFull {
  wards: MaternityWard[];
  /** Effective ward being queried (the user's selection, or the first ward). */
  ward: string | null;
  /** Same value as `ward`; exposed for the ward <select> value binding. */
  selectedWard: string | null;
  /** Switch the queried ward. Ignored values that aren't in `wards` fall back to the first ward. */
  setSelectedWard: (ward: string) => void;
  /** Bed layout of `ward`. Empty until loaded — check `bedsLoaded` before reading "no beds". */
  beds: BedSlot[];
  /** Admitted patients of `ward`. Empty until loaded — check `occupancyLoaded` before reading "nobody admitted". */
  occupancy: BedOccupancyFull[];
  /** Newborn admissions (HOSxP admit type แรกเกิด) on this ward's beds —
   *  excluded from `occupancy` and every count; listed for a staff notice. */
  newborns: BedOccupancyFull[];
  /** True once the bed layout of the current ward has been fetched at least once (data !== undefined). */
  bedsLoaded: boolean;
  /** True once the patient list of the current ward has been fetched at least once (data !== undefined). */
  occupancyLoaded: boolean;
  /** Ward list still loading (no wards and no error yet). */
  isLoading: boolean;
  /** First outstanding error of any feed (wards → beds → occupancy). */
  error: Error | null;
  wardsError: Error | null;
  bedsError: Error | null;
  occupancyError: Error | null;
  /** ISO time the current failure began (earliest still-failing feed); null while healthy. */
  failingSince: string | null;
  /** Live-data health for the masthead LIVE badge. */
  health: WardFeedHealth;
  /** ISO time of the last successful occupancy fetch FOR THE CURRENT WARD —
   *  the live pill's "อัปเดต HH:MM". Null after a ward switch until it loads. */
  lastUpdatedAt: string | null;
  mutateWards: () => Promise<unknown>;
  mutateBeds: () => Promise<unknown>;
  mutateOccupancy: () => Promise<unknown>;
}

export const WARD_LIST_REFRESH_MS = 60_000;
const BEDS_REFRESH_INTERVAL = 60_000;
export const WARD_OCCUPANCY_REFRESH_MS = 20_000;

/** When a feed started failing, tagged with the ward (or 'wards') it failed for. */
type FeedFailures = Partial<Record<WardFeed, { key: string; at: string }>>;

export function useMaternityWardStateFull(): MaternityWardStateFull {
  const { config } = useBmsSession();

  // Failure-streak start per feed: kept from the first failed attempt until
  // that feed succeeds again, so the error can say "since when".
  const [failures, setFailures] = useState<FeedFailures>({});
  const markFailed = (feed: WardFeed, key: string) =>
    setFailures((f) =>
      f[feed]?.key === key ? f : { ...f, [feed]: { key, at: new Date().toISOString() } },
    );
  const markOk = (feed: WardFeed) =>
    setFailures((f) => {
      if (!f[feed]) return f;
      const next = { ...f };
      delete next[feed];
      return next;
    });

  const {
    data: wards,
    error: wardsErr,
    mutate: mutateWards,
  } = useSWR(
    config ? ['maternity-wards', config.apiUrl] : null,
    () => listMaternityWards(config!),
    {
      refreshInterval: WARD_LIST_REFRESH_MS,
      onSuccess: () => markOk('wards'),
      onError: () => markFailed('wards', 'wards'),
    },
  );

  // The user's explicit ward pick. Null until they choose one, in which case
  // we default to the first ward. If the picked ward disappears from the list
  // (ward roster changed server-side) we fall back to the first ward so the
  // board never queries a ward that no longer exists.
  const [pickedWard, setPickedWard] = useState<string | null>(null);
  const firstWard = wards?.[0]?.ward ?? null;
  const pickedIsValid = pickedWard !== null && (wards?.some((w) => w.ward === pickedWard) ?? false);
  const ward = pickedIsValid ? pickedWard : firstWard;

  const {
    data: beds,
    mutate: mutateBeds,
    error: bedsErr,
    isValidating: bedsValidating,
  } = useSWR(
    config && ward ? ['ward-beds-inventory', config.apiUrl, ward] : null,
    () => listWardBedsInventory(config!, ward!),
    {
      refreshInterval: BEDS_REFRESH_INTERVAL,
      // SWR only fires these for the current key, so `ward` is the fetched ward.
      onSuccess: () => markOk('beds'),
      onError: () => markFailed('beds', ward!),
    },
  );

  // The fetch time travels WITH the rows (one SWR entry per ward), so the
  // freshness stamp can never belong to another ward or outlive its data —
  // including rows served from the SWR cache after navigating back.
  const {
    data: occupancySnapshot,
    mutate: mutateOccupancy,
    error: occupancyErr,
    isValidating: occupancyValidating,
  } = useSWR(
    config && ward ? ['ward-beds-occupancy-full', config.apiUrl, ward] : null,
    async () => ({
      rows: await listWardBedsOccupancyFull(config!, ward!),
      fetchedAt: new Date().toISOString(),
    }),
    {
      refreshInterval: WARD_OCCUPANCY_REFRESH_MS,
      onSuccess: () => markOk('occupancy'),
      onError: () => markFailed('occupancy', ward!),
    },
  );
  // Newborn admissions on this ward's beds are not labouring patients — split
  // them off before anything counts (see splitWardOccupants).
  const split = occupancySnapshot ? splitWardOccupants(occupancySnapshot.rows) : undefined;
  const occupancy = split?.patients;

  const wardsError: Error | null = wardsErr ?? null;
  const bedsError: Error | null = bedsErr ?? null;
  const occupancyError: Error | null = occupancyErr ?? null;
  const error = wardsError ?? bedsError ?? occupancyError;
  const isLoading = config !== null && wards === undefined && error === null;

  const failingSince =
    (
      [
        ['wards', wardsError, 'wards'],
        ['beds', bedsError, ward],
        ['occupancy', occupancyError, ward],
      ] as const
    )
      .filter(([feed, err, key]) => err !== null && failures[feed]?.key === key)
      .map(([feed]) => failures[feed]!.at)
      .sort()[0] ?? null;
  const lastUpdatedAt = occupancySnapshot?.fetchedAt ?? null;

  // Health drives the masthead LIVE badge. A settled error is 'error'; while
  // SWR is re-fetching after an error (retry in flight) surface 'reconnecting'
  // so the badge distinguishes "down" from "recovering"; otherwise 'ok'.
  const isRevalidating = Boolean(bedsValidating) || Boolean(occupancyValidating);
  const health: WardFeedHealth = error ? (isRevalidating ? 'reconnecting' : 'error') : 'ok';

  return {
    wards: wards ?? [],
    ward,
    selectedWard: ward,
    setSelectedWard: setPickedWard,
    beds: beds ?? [],
    occupancy: occupancy ?? [],
    newborns: split?.newborns ?? [],
    bedsLoaded: beds !== undefined,
    occupancyLoaded: occupancy !== undefined,
    isLoading,
    error,
    wardsError,
    bedsError,
    occupancyError,
    failingSince,
    health,
    lastUpdatedAt,
    mutateWards: () => mutateWards(),
    mutateBeds: () => mutateBeds(),
    mutateOccupancy: () => mutateOccupancy(),
  };
}
