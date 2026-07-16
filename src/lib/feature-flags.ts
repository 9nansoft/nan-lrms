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

/**
 * Maternal screening ingest from webhook or browser-push.
 *
 * FAIL CLOSED: ingest is off by default. Set MATERNAL_SCREEN_INGEST_ENABLED=true
 * to enable persistent capture of maternal screening assessments.
 */
export function isMaternalScreenIngestEnabled(): boolean {
  return process.env.MATERNAL_SCREEN_INGEST_ENABLED === 'true';
}

/**
 * Maternal screening shadow-mode (dormant, no workflow effects).
 *
 * ON BY DEFAULT: shadow mode is enabled by default (inert evaluation only).
 * Set MATERNAL_SCREEN_SHADOW_MODE=false to disable. In production, this flag
 * should remain true to prevent unapproved clinical rules from affecting workflows.
 */
export function isMaternalScreenShadowMode(): boolean {
  return process.env.MATERNAL_SCREEN_SHADOW_MODE !== 'false';
}

/**
 * Maternal screening UI components and dashboard panels.
 *
 * FAIL CLOSED: UI is off by default. Set MATERNAL_SCREEN_UI_ENABLED=true
 * to display maternal screening results in patient detail and summary views.
 */
export function isMaternalScreenUiEnabled(): boolean {
  return process.env.MATERNAL_SCREEN_UI_ENABLED === 'true';
}

/**
 * Maternal screening state-change events (SSE broadcast).
 *
 * FAIL CLOSED: events are off by default. Set MATERNAL_SCREEN_EVENTS_ENABLED=true
 * to emit maternal screening state-change notifications to connected clients.
 */
export function isMaternalScreenEventsEnabled(): boolean {
  return process.env.MATERNAL_SCREEN_EVENTS_ENABLED === 'true';
}
