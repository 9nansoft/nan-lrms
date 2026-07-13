// Centralized feature-flag helpers. Any check that gates a feature behind
// environment configuration should live here so we don't drift across call
// sites when the rules change.

/**
 * Destructive dev-simulation surface (/api/dev/simulate/*).
 *
 * FAIL CLOSED: never enabled in production, regardless of environment
 * variables — these routes wipe clinical tables. Outside production the
 * simulation is on by default and can be turned off with
 * DEV_SIMULATION_ENABLED=false.
 */
export function isSimulationEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.DEV_SIMULATION_ENABLED !== 'false';
}
