import { describe, it, expect, afterEach, vi } from 'vitest';
import { isSimulationEnabled } from '@/lib/feature-flags';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isSimulationEnabled', () => {
  it('is ALWAYS false in production, even when the flag says true', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_SIMULATION_ENABLED', 'true');
    expect(isSimulationEnabled()).toBe(false);
  });

  it('is false in production with the flag unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_SIMULATION_ENABLED', '');
    expect(isSimulationEnabled()).toBe(false);
  });

  it('defaults to enabled outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_SIMULATION_ENABLED', '');
    expect(isSimulationEnabled()).toBe(true);
  });

  it('can be explicitly disabled outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_SIMULATION_ENABLED', 'false');
    expect(isSimulationEnabled()).toBe(false);
  });
});
