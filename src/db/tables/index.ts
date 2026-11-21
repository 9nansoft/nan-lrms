import type { TableDefinition } from '../table-definition';
import { hospitalsTable } from './hospitals';
import { hospitalNodesTable } from './hospital-nodes';
import { hospitalBmsConfigTable } from './hospital-bms-config';
import { hospitalConsultDoctorsTable } from './hospital-consult-doctors';
import { patientConsultsTable } from './patient-consults';
import { consultMessagesTable } from './consult-messages';
import { cachedPatientsTable } from './cached-patients';
import { cachedPartographObservationsTable } from './cached-partograph-observations';
import { cachedMaternityAssessmentsTable } from './cached-maternity-assessments';
import { cachedMaternityAssessmentCursorsTable } from './cached-maternity-assessment-cursors';
import { cachedAssessmentFormMetadataTable } from './cached-assessment-form-metadata';
import { cachedVitalSignsTable } from './cached-vital-signs';
import { cpdScoresTable } from './cpd-scores';
import { maternalScreeningAssessmentsTable } from './maternal-screening-assessments';
import { usersTable } from './users';
import { auditLogsTable } from './audit-logs';
import { webhookApiKeysTable } from './webhook-api-keys';
import { maternalJourneysTable } from './maternal-journeys';
import { cachedAncVisitsTable } from './cached-anc-visits';
import { cachedAncRisksTable } from './cached-anc-risks';
import { cachedAncLabResultsTable } from './cached-anc-lab-results';
import { cachedReferralsTable } from './cached-referrals';
import { cachedNewbornsTable } from './cached-newborns';
import { provincesTable } from './provinces';
import { districtsTable } from './districts';
import { tambonsTable } from './tambons';
import { mophHospitalsTable } from './moph-hospitals';
import { systemConfigTable } from './system-config';
import { videoCallsTable } from './video-calls';
import { videoCallParticipantsTable } from './video-call-participants';
import { mophAlertLogTable } from './moph-alert-log';
import { mophAlertEventQueueTable } from './moph-alert-event-queue';
import { mophCenterMonitorsTable } from './moph-center-monitors';
import { notificationPreferencesTable } from './notification-preferences';
import { notificationEventSubscriptionsTable } from './notification-event-subscriptions';

export {
  hospitalsTable,
  hospitalNodesTable,
  hospitalBmsConfigTable,
  hospitalConsultDoctorsTable,
  patientConsultsTable,
  consultMessagesTable,
  cachedPatientsTable,
  cachedPartographObservationsTable,
  cachedMaternityAssessmentsTable,
  cachedMaternityAssessmentCursorsTable,
  cachedAssessmentFormMetadataTable,
  cachedVitalSignsTable,
  cpdScoresTable,
  maternalScreeningAssessmentsTable,
  usersTable,
  auditLogsTable,
  webhookApiKeysTable,
  maternalJourneysTable,
  cachedAncVisitsTable,
  cachedAncRisksTable,
  cachedAncLabResultsTable,
  cachedReferralsTable,
  cachedNewbornsTable,
  provincesTable,
  districtsTable,
  tambonsTable,
  mophHospitalsTable,
  systemConfigTable,
  videoCallsTable,
  videoCallParticipantsTable,
  mophAlertLogTable,
  mophAlertEventQueueTable,
  mophCenterMonitorsTable,
  notificationPreferencesTable,
  notificationEventSubscriptionsTable,
};

// All tables in creation order (respects foreign key dependencies)
export const ALL_TABLES: TableDefinition[] = [
  provincesTable,
  districtsTable,
  tambonsTable,
  mophHospitalsTable,
  systemConfigTable,
  hospitalsTable,
  // Node-hospital tree: both FKs point at hospitals, so it follows it.
  hospitalNodesTable,
  hospitalBmsConfigTable,
  hospitalConsultDoctorsTable,
  // MOPH Prompt alerts — both reference hospitals, so after hospitalsTable.
  // moph_center_monitors is province-scoped (no FK); moph_alert_log FKs hospitals.
  mophCenterMonitorsTable,
  // Per-user MOPH LINE notification opt-in — hospital-scoped, no FK to users.
  notificationPreferencesTable,
  // Per-event opt-in rows hanging off a preference; must follow it.
  notificationEventSubscriptionsTable,
  // Recipient-independent events must precede the per-recipient delivery log.
  mophAlertEventQueueTable,
  mophAlertLogTable,
  usersTable,
  maternalJourneysTable,
  cachedPatientsTable,
  cachedPartographObservationsTable,
  // References cached_patients, hospitals (both above) — must stay after them.
  cachedMaternityAssessmentsTable,
  // References hospitals (above).
  cachedMaternityAssessmentCursorsTable,
  // The label cache of the assessment forms — references hospitals (above).
  cachedAssessmentFormMetadataTable,
  // Consult records — references hospitals + cached_patients (both above).
  patientConsultsTable,
  // The consult thread — references patient_consults + hospitals (above).
  consultMessagesTable,
  cachedVitalSignsTable,
  cpdScoresTable,
  // References cached_patients, hospitals, maternal_journeys (all above) —
  // must stay after all three (GC5).
  maternalScreeningAssessmentsTable,
  auditLogsTable,
  webhookApiKeysTable,
  cachedAncVisitsTable,
  cachedAncRisksTable,
  cachedAncLabResultsTable,
  cachedReferralsTable,
  cachedNewbornsTable,
  videoCallsTable,
  videoCallParticipantsTable,
];
