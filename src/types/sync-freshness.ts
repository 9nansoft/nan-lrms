import type { SyncHealthClass } from '@/config/hospital-network';

export interface FreshnessSummary {
  generatedAt: string;
  province: {
    reporting: number;
    fresh: number;
    stale: number; // stale + critical + future-dated
    never: number;
    highRisk: number;
    lastSyncAt: string | null;
  };
  own: { hcode: string; name: string; lastSyncAt: string | null; health: SyncHealthClass; highRisk: number } | null;
}
