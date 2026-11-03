// The gateway's authoritative active-ANC CID list (anc.activeCids) — the
// server closes any PREGNANCY journey absent from it, so it must be complete.
// See tests/unit/api/browser-push-anc-reconcile.test.ts for the server half.
import { describe, it, expect } from 'vitest';
import { ancActiveCids, ANC_MASTERS_LIMIT, ancMastersSql } from '@/lib/browser-poll';

const master = (cid: unknown) => ({ person_anc_id: 1, cid, preg_no: 1 });

describe('ancActiveCids', () => {
  it('lists every 13-digit CID HOSxP returned, deduplicated', () => {
    expect(
      ancActiveCids([master('1007000100131'), master('1007000100140'), master('1007000100131')]),
    ).toEqual(['1007000100131', '1007000100140']);
  });

  it('skips CIDs that are not 13 digits (they cannot match a journey anyway)', () => {
    expect(ancActiveCids([master('12345'), master(null), master(' 1007000100131 ')])).toEqual([
      '1007000100131',
    ]);
  });

  it('is an empty list — not undefined — when HOSxP has no active ANC', () => {
    // A successful empty result is a real answer: everyone left the registry.
    expect(ancActiveCids([])).toEqual([]);
  });

  it('is undefined when the pull hit the row limit, so nothing is closed against a partial list', () => {
    const rows = Array.from({ length: ANC_MASTERS_LIMIT }, (_, i) =>
      master(String(1_000_000_000_000 + i)),
    );
    expect(ancActiveCids(rows)).toBeUndefined();
  });

  it('uses the same limit the masters query applies', () => {
    expect(ancMastersSql()).toContain(`LIMIT ${ANC_MASTERS_LIMIT}`);
  });
});
