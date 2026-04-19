'use client';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancy,
} from '@/services/maternity-ward';
import type { MaternityWard, BedSlot, BedOccupancy } from '@/types/maternity-ward';

export interface MaternityWardState {
  wards: MaternityWard[];
  ward: string | null; // currently selected ward (first one)
  beds: BedSlot[];
  occupancy: BedOccupancy[];
  isLoading: boolean;
  error: Error | null;
  mutateBeds: () => Promise<unknown>;
  mutateOccupancy: () => Promise<unknown>;
}

const WARD_REFRESH_INTERVAL = 60_000; // ward list rarely changes
const BEDS_REFRESH_INTERVAL = 60_000; // bed inventory rarely changes
const OCCUPANCY_REFRESH_INTERVAL = 20_000; // occupants change in real-time

export function useMaternityWardState(): MaternityWardState {
  const { config } = useBmsSession();

  const { data: wards, error: wardsErr } = useSWR(
    config ? ['maternity-wards', config.apiUrl] : null,
    () => listMaternityWards(config!),
    { refreshInterval: WARD_REFRESH_INTERVAL },
  );

  const ward = wards?.[0]?.ward ?? null;

  const { data: beds, mutate: mutateBeds, error: bedsErr } = useSWR(
    config && ward ? ['ward-beds-inventory', config.apiUrl, ward] : null,
    () => listWardBedsInventory(config!, ward!),
    { refreshInterval: BEDS_REFRESH_INTERVAL },
  );

  const { data: occupancy, mutate: mutateOccupancy, error: occupancyErr } = useSWR(
    config && ward ? ['ward-beds-occupancy', config.apiUrl, ward] : null,
    () => listWardBedsOccupancy(config!, ward!),
    { refreshInterval: OCCUPANCY_REFRESH_INTERVAL },
  );

  const error = wardsErr ?? bedsErr ?? occupancyErr ?? null;
  const isLoading = config !== null && wards === undefined && error === null;

  return {
    wards: wards ?? [],
    ward,
    beds: beds ?? [],
    occupancy: occupancy ?? [],
    isLoading,
    error,
    mutateBeds: () => mutateBeds(),
    mutateOccupancy: () => mutateOccupancy(),
  };
}
