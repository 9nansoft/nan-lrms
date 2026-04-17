// Newborn sync — HOSxP labour_infant rows → cached_newborns + journey transition
import type { DatabaseAdapter } from '@/db/adapter';
import type { HosxpLabourInfantRow } from '@/types/hosxp';
import { upsertNewborn } from '@/services/newborn';
import { transitionToDelivered } from '@/services/journey';

export async function syncNewbornData(
  db: DatabaseAdapter,
  journeyId: string,
  infantRows: HosxpLabourInfantRow[],
): Promise<number> {
  let count = 0;

  for (const infant of infantRows) {
    const bornAt = infant.birth_date && infant.birth_time
      ? `${infant.birth_date}T${infant.birth_time}`
      : infant.birth_date ?? new Date().toISOString();

    await upsertNewborn(db, {
      journeyId,
      infantNumber: infant.infant_number,
      sex: infant.sex ?? undefined,
      birthWeightG: infant.birth_weight ?? undefined,
      bodyLengthCm: infant.body_length ?? undefined,
      headCircumCm: infant.head_length ?? undefined,
      temperature: infant.temperature ?? undefined,
      heartRate: infant.hr ?? undefined,
      respiratoryRate: infant.rr ?? undefined,
      apgar1min: infant.apgar_score_min1 ?? undefined,
      apgar5min: infant.apgar_score_min5 ?? undefined,
      apgar10min: infant.apgar_score_min10 ?? undefined,
      resuscitation: {
        ppv: infant.infant_check_ppv === 'Y',
        et_tube: infant.infant_check_et_tube === 'Y',
        chest_pump: infant.infant_check_chest_pump === 'Y',
        oxygen_box: infant.infant_check_oxygen_box === 'Y',
        narcan: infant.infant_check_narcan === 'Y',
      },
      vaccinations: {
        bcg: infant.infant_check_bcg === 'Y',
        hepb: infant.infant_check_hepb === 'Y',
        vitk: infant.infant_check_vitk === 'Y',
        eye_paste: infant.infant_check_eyepaste === 'Y',
        azt: infant.infant_check_azt === 'Y',
      },
      infantIcd10: infant.infant_icd10 ?? undefined,
      infantHn: infant.infant_hn ?? undefined,
      infantAn: infant.infant_an ?? undefined,
      dischargeStatus: infant.infant_dchstts ?? undefined,
      bornAt,
    });
    count++;
  }

  if (infantRows.length > 0) {
    await transitionToDelivered(db, journeyId);
  }

  return count;
}
