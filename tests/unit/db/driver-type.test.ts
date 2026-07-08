import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDriverType } from '@/db/connection';

// getDriverType must mirror getDatabase()'s adapter precedence: PGlite is a
// real Postgres engine, so it needs the postgresql dialect even when
// USE_SQLITE (or NODE_ENV=test) would otherwise force sqlite. Regression for
// the boot crash "invalid input syntax for type integer: \"true\"" — schema
// created with sqlite INTEGER booleans inside PGlite.
describe('getDriverType', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns postgresql for PGlite even when USE_SQLITE is also set', () => {
    vi.stubEnv('USE_PGLITE', 'true');
    vi.stubEnv('USE_SQLITE', 'true');
    expect(getDriverType()).toBe('postgresql');
  });

  it('returns postgresql for PGlite in test env (NODE_ENV=test forces sqlite otherwise)', () => {
    vi.stubEnv('USE_PGLITE', 'true');
    expect(getDriverType()).toBe('postgresql');
  });

  it('returns sqlite when only USE_SQLITE is set', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('USE_SQLITE', 'true');
    expect(getDriverType()).toBe('sqlite');
  });

  it('returns sqlite in test env with no overrides (matches getDatabase)', () => {
    expect(getDriverType()).toBe('sqlite');
  });

  it('returns postgresql when nothing forces an embedded driver', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getDriverType()).toBe('postgresql');
  });
});
