# UI redesign — items needing owner sign-off (2026-10-11)

The redesign (sub-projects 1–5) is merged on local `main`, not pushed and not
deployed. These decisions were made provisionally so work could continue.
Each says what is shipped today and what to decide.

## Clinical (obstetric owner)

1. **Patient on a bed locked in HOSxP (ward board, B1).** Previously hidden
   behind a "ปิดบำรุง" tile yet counted as both occupied and locked. Now she
   stays visible with a "เตียงถูกล็อกใน HOSxP" chip and is counted once, as
   occupied. — Confirm.
2. **Patients without a usable bed number.** Admissions with a blank bed, a
   bed outside the ward layout, or two admissions on one bed used to vanish
   from the board. They now appear in "ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง" or
   on a shared-bed tile, and "มีผู้คลอด" counts patients (it can exceed
   occupied beds). — Confirm.
3. **Ward tile renamed "ระยะแฝงนาน"** (was "high-risk"). Its rule is
   admitted ≥ 12 h with cervix < 4 cm; it never counted CPD risk. When no
   cervix record exists the tile reads "ยังไม่มีบันทึกปากมดลูก ≥12 ชม.". —
   Confirm wording.
4. **Thresholds moved to config with values unchanged, but they disagree:**
   - Missed-ANC: hospital console 14 days vs province board 35 days
     (`HOSPITAL_CONSOLE` vs `ANC_OPS`).
   - ANC visit/day bands on the patient page 4 / 8 visits, 28 days vs
     `ANC_OPS` 5 / 35.
   - Labour phase at exactly 7 cm: ward tile = transition (≥ 7), patient
     QuickStatsBar = "ระยะเร่ง" (≤ 7). Same Thai word, different ranges.
   — Choose one value for each.
5. **Kiosk CPD colours** now follow `RISK_LEVELS` (high ≥ 10, medium ≥ 5)
   instead of the kiosk's own ≥ 6 / ≥ 4, so CPD 6–9 is amber, not red, on the
   wall display. — Confirm.
6. **New Thai copy:** "ไม่ทราบประวัติแพ้ยา" when HOSxP sends no allergy data
   (was "ไม่มีประวัติแพ้ยา"); borderline BP "↑ เฝ้าระวัง"; weight-gain tile
   "น้ำหนักที่เพิ่ม". — Confirm.

## Privacy / PDPA (data protection owner)

7. **About page** previously claimed patient names are never shown. New text
   states names and CIDs are encrypted at rest and shown masked
   (e.g. "สมหญิง ข.", "3XXXXXXXX2121"), lists the ProviderID read-only login,
   and the access audit. — Approve wording.
8. **Login page** note previously said all patient data is encrypted. Now:
   "ชื่อและเลขบัตรประชาชนผู้ป่วยถูกเข้ารหัสและแสดงแบบปิดบังบางส่วน …". —
   Approve wording.
9. **Consult-doctor CIDs** are shown unmasked in the admin hospital dialog
   (admin-only). Not changed. — Decide whether to mask.

## Data (HOSxP data owner)

10. The ward occupancy SQL inner-joins `iptadm`; an admission with no
    `iptadm` row never reaches the board. Changing it is a query change in
    `src/config/hosxp-queries.ts`. — Decide.

## Accepted layout trade-offs (no action unless you object)

- Dashboard stacks to one column below ~1407 px viewport.
- Journey detail rail stacks below the main column under ~1160 px container,
  so risk/next action sit lower on tablets.
- Ward bed tiles have two tab stops (drag handle + open); a single drag-grip
  activator is a design follow-up.
