import { describe, it, expect } from 'vitest';
import { cachedPatientsTable } from '@/db/tables/cached-patients';

describe('cached_patients — partograph columns', () => {
  it('has partograph_severity (nullable string)', () => {
    const col = cachedPatientsTable.fields.find(
      (f) => f.name === 'partograph_severity');
    expect(col).toBeDefined();
    expect(col!.type).toBe('string');
    expect(col!.nullable).toBe(true);
  });

  it('has partograph_alert_count (nullable integer)', () => {
    const col = cachedPatientsTable.fields.find(
      (f) => f.name === 'partograph_alert_count');
    expect(col).toBeDefined();
    expect(col!.type).toBe('integer');
    expect(col!.nullable).toBe(true);
  });
});
