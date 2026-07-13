# Release B — Clinical-Data Reconciliation Evidence

**For:** clinical-owner sign-off (Release B "reconciliation contract")
**Generated:** 2026-07-13 (read-only queries against the production kk-lrms database)
**Source:** the three queries in `src/services/reconciliation.ts`, run verbatim; identical to what `GET /api/admin/reconciliation-report` returns
**Data as of:** production database at deploy of `1d4e608` (Releases A+B+C live)

> This is a **read-only** discrepancy report. Nothing was modified. It contains **de-identified
> aggregates only** — hospital codes, counts, and de-identified admission dates. No patient
> names or CIDs appear.

---

## Bottom line

Reconciliation is **clean and favorable — safe to bless the Release B canonical rules.**

| Check | Result | Meaning |
|---|---:|---|
| ANC risk mismatches (journey level vs latest screening) | **0** | The new canonical ANC rule introduces **no discrepancy** with existing data |
| Duplicate active journeys per (hospital, HN) | **0** | The one-active-journey invariant already holds; the `uq_mj_hospital_hn_active` index was **created cleanly at deploy** (fail-safe path not needed) |
| PREGNANCY journeys with an active labor admission ("stuck") | **3** | Pre-existing residue of the LABOR-transition bug B1 fixes — **the only actionable item** |

## Context (denominators)

- **5,258** maternal journeys total: 1,726 pregnancy · 3 labor · 3,529 delivered
- **108** journeys have ANC risk screenings (LOW 82 · HR1 8 · HR2 13 · HR3 5)
- Only these 108 are eligible for a risk-mismatch — and **0** disagree with their latest screening.

---

## The three decisions to bless (reconciliation contract)

1. **Canonical ANC rule** — item-derived severity is authoritative; a declared level may only *raise* it, never lower it. **Evidence:** 0 existing journeys conflict with this rule. The production browser sync already computes risk this way, so no back-conversion is needed.
2. **Historical-correction policy: future-only** — no historical rows were rewritten by this deploy. The 3 stuck cases below are pre-existing; they are corrected going forward, not retroactively edited.
3. **Duplicate active journeys** — **0 found**, so the uniqueness index was created without touching any data. (If any had existed, the migration would have *refused* to create the index and reported them, never deleting a row.)

## The one actionable finding — 3 "stuck" PREGNANCY-with-active-labor cases

These are journeys still marked PREGNANCY that have an ACTIVE labor admission for the same patient — the exact bug B1 fixes. B1 is now live, so most should self-heal on the next browser-push sync. De-identified detail:

| Hospital | Risk | Journey stage since | Labor admitted | Labor last updated | Assessment |
|---|---|---|---|---|---|
| 11011 เขาสวนกวาง | LOW | 2026-07-13 | 2026-07-07 | 2026-07-12 | Recent + active → should transition to LABOR on next sync |
| 11009 มัญจาคีรี | LOW | 2026-07-13 | 2026-07-08 | 2026-07-08 | Recent + active → should self-heal on next sync |
| **10995 บ้านฝาง** | LOW | 2026-07-07 | **2026-06-12** | **2026-06-12** | **STALE** — labor admission ~1 month old, untouched since 12 Jun. May have delivered/discharged in HOSxP without cache reconciliation. **Recommend manual review** rather than assuming self-heal. |

**Recommended action:** re-check this report after ~1–2 sync cycles. The two recent cases should drop to 0; if บ้านฝาง persists, review that patient's HOSxP record directly (it looks like a stale cached admission, not a live labor).

## Two items to confirm for the sign-off artifact (both benign here)

- The deployed `/api/admin/reconciliation-report` includes **HN** in the duplicate list (needed to physically locate a duplicate for remediation). The repo's PDPA convention (`pii-mask.ts`) masks name/CID but **not HN**. Confirm HN is acceptable in a sign-off document. *(Moot today: 0 duplicates, so no HN appears.)*
- In the report payload, `hospitalId` = **current** hospital for risk/stuck rows but **registering** hospital for duplicate rows (deliberate — it matches the uniqueness definition the index enforces).

---

## Sign-off

- [ ] Clinical owner reviewed and approves the canonical ANC classification rule (derived severity authoritative)
- [ ] Approves future-only correction policy (no historical rewrite)
- [ ] Acknowledges the 3 stuck-pregnancy cases and the บ้านฝาง manual-review recommendation

**Name / date:** ______________________
