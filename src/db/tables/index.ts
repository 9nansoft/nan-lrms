import type { TableDefinition } from '../table-definition';
import { hospitalsTable } from './hospitals';
import { hospitalBmsConfigTable } from './hospital-bms-config';
import { hospitalConsultDoctorsTable } from './hospital-consult-doctors';
import { cachedPatientsTable } from './cached-patients';
import { cachedPartographObservationsTable } from './cached-partograph-observations';
import { cachedVitalSignsTable } from './cached-vital-signs';
import { cpdScoresTable } from './cpd-scores';
import { maternalScreeningAssessmentsTable } from './maternal-screening-assessments';
import { usersTable } from './users';
import { auditLogsTable } from './audit-logs';
import { webhookApiKeysTable } from './webhook-api-keys';
import { maternalJourneysTable } from './maternal-journeys';
import { cachedAncVisitsTable } from './cached-anc-visits';
import { cachedAncRisksTable } from './cached-anc-risks';
import { cachedReferralsTable } from './cached-referrals';
import { cachedNewbornsTable } from './cached-newborns';
import { provincesTable } from './provinces';
import { districtsTable } from './districts';
import { tambonsTable } from './tambons';
import { mophHospitalsTable } from './moph-hospitals';
import { systemConfigTable } from './system-config';
import { videoCallsTable } from './video-calls';
import { videoCallParticipantsTable } from './video-call-participants';

export {
  hospitalsTable,
  hospitalBmsConfigTable,
  hospitalConsultDoctorsTable,
  cachedPatientsTable,
  cachedPartographObservationsTable,
  cachedVitalSignsTable,
  cpdScoresTable,
  maternalScreeningAssessmentsTable,
  usersTable,
  auditLogsTable,
  webhookApiKeysTable,
  maternalJourneysTable,
  cachedAncVisitsTable,
  cachedAncRisksTable,
  cachedReferralsTable,
  cachedNewbornsTable,
  provincesTable,
  districtsTable,
  tambonsTable,
  mophHospitalsTable,
  systemConfigTable,
  videoCallsTable,
  videoCallParticipantsTable,
};

// All tables in creation order (respects foreign key dependencies)
export const ALL_TABLES: TableDefinition[] = [
  provincesTable,
  districtsTable,
  tambonsTable,
  mophHospitalsTable,
  systemConfigTable,
  hospitalsTable,
  hospitalBmsConfigTable,
  hospitalConsultDoctorsTable,
  usersTable,
  maternalJourneysTable,
  cachedPatientsTable,
  cachedPartographObservationsTable,
  cachedVitalSignsTable,
  cpdScoresTable,
  // References cached_patients, hospitals, maternal_journeys (all above) —
  // must stay after all three (GC5).
  maternalScreeningAssessmentsTable,
  auditLogsTable,
  webhookApiKeysTable,
  cachedAncVisitsTable,
  cachedAncRisksTable,
  cachedReferralsTable,
  cachedNewbornsTable,
  videoCallsTable,
  videoCallParticipantsTable,
];
