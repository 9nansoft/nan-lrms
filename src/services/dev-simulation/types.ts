// Dev-mode simulation — type contract shared by server engine, API routes,
// and the UI. MVP ships labor / anc / referral events; partograph + referral
// updates are wired as stubs ready to enable.

export type SimEventType = 'labor' | 'anc' | 'referral' | 'referral_update' | 'partograph';

export interface SimulationConfig {
  /** hcodes to simulate (e.g. ['10670','10998']). Empty = all 26. */
  hospitals: string[];
  /** Event types to generate. Must include at least one. */
  eventTypes: SimEventType[];
  /** Target events per minute per hospital (random jitter ±30 %). */
  ratePerHospitalPerMin: number;
  /** Total run duration in minutes (server stops itself at the deadline). */
  durationMin: number;
  /** LLM model id (see /v1/models endpoint). */
  model: string;
  /** Optional free-text scenario description steered at the generator. */
  scenario?: string;
}

export interface SimulationEventLog {
  /** ISO timestamp of when the event was persisted. */
  at: string;
  hcode: string;
  type: SimEventType;
  ok: boolean;
  summary: string;
  error?: string;
}

export interface HospitalSimState {
  hcode: string;
  hospitalName: string;
  running: boolean;
  eventsSucceeded: number;
  eventsFailed: number;
  lastEventAt: string | null;
  lastError: string | null;
  /** Tier-3 plan summary for this hospital, or null while plan is generating. */
  plan?: {
    narrative: string;
    total: number;
    consumed: number;
    remaining: number;
    refilling: boolean;
  } | null;
}

export interface EvaluationStatsSummary {
  accepted: number;
  rejected: number;
  warnings: number;
  lastRejection: { profile: string; errors: string[] } | null;
}

export interface SimulationStatus {
  running: boolean;
  startedAt: string | null;
  stoppingAt: string | null;
  config: SimulationConfig | null;
  hospitals: HospitalSimState[];
  recentEvents: SimulationEventLog[];
  /** Aggregate LLM-output evaluation stats for the current run. */
  evaluation?: EvaluationStatsSummary;
}
