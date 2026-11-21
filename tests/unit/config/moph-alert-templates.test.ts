// TDD (Red→Green) for MOPH Prompt LINE Flex alert templates.
// Pins the PDPA rule (codex #6c): province-center scope MUST NOT carry patient
// name/cid; hospital-staff scope MAY carry a limited patient reference.
import { describe, it, expect } from 'vitest';
import { buildAlertFlex, buildAlertMessage, alertTitle } from '@/config/moph-alert-templates';

const HOSP = 'รพ.ขอนแก่น';
const CASE = 'ANC-2026-0001';

describe('buildAlertFlex', () => {
  it('HIGH hospital-scope bubble has severity badge, hospital name, case ref, confirm button', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
      patientName: 'น.ส. A',
      confirmUrl: 'https://app/case/ANC-2026-0001',
    });
    const json = JSON.stringify(flex);
    expect(flex).toMatchObject({ type: 'bubble' });
    expect(json).toContain('เสี่ยงสูง');
    expect(json).toContain(HOSP);
    expect(json).toContain(CASE);
    expect(json).toContain('https://app/case/ANC-2026-0001');
    // hospital scope MAY include the limited patient ref
    expect(json).toContain('น.ส. A');
  });

  // The caseRef is patient-identifying: ANC alerts build it as
  // `ANC-<13-digit CID>-G<n>` (browser-push/route.ts). It was rendered to every
  // scope, so a recipient watching another hospital would receive that
  // hospital's patients' national IDs. detailLevel:'aggregate' is what makes
  // cross-hospital subscription safe to re-open.
  const CID_CASE = 'ANC-3320500282121-G2';

  it('aggregate detail carries NO case reference, and so no patient CID', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'self_subscribed',
      detailLevel: 'aggregate',
      hospitalName: HOSP,
      caseRef: CID_CASE,
      patientName: 'น.ส. A',
      confirmUrl: 'https://app/case/x',
    });
    const json = JSON.stringify(flex);
    expect(json).not.toContain(CID_CASE);
    expect(json).not.toContain('3320500282121');
    expect(json).not.toContain('น.ส. A');
    // …but it is still a usable alert: severity and origin hospital remain.
    expect(json).toContain('เสี่ยงสูง');
    expect(json).toContain(HOSP);
  });

  it('full detail still carries the case reference (unchanged behaviour)', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'hospital_staff',
      detailLevel: 'full',
      hospitalName: HOSP,
      caseRef: CID_CASE,
    });
    expect(JSON.stringify(flex)).toContain(CID_CASE);
  });

  it('defaults to full when detailLevel is omitted, so existing callers are unaffected', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
    });
    expect(JSON.stringify(flex)).toContain(CASE);
  });

  it('EMERGENCY hospital-scope bubble carries ฉุกเฉิน styling', () => {
    const flex = buildAlertFlex({
      severity: 'emergency',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
      acuityLabel: 'ฉุกเฉิน',
    });
    const json = JSON.stringify(flex);
    expect(json).toContain('ฉุกเฉิน');
    expect(json).toContain(HOSP);
  });

  it('province_center scope contains NO patient name (PDPA)', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'province_center',
      hospitalName: HOSP,
      caseRef: CASE,
      patientName: 'น.ส. A',
    });
    const json = JSON.stringify(flex);
    expect(json).toContain(HOSP); // origin hospital is ok — it's the sender context
    expect(json).toContain(CASE);
    // The patient name MUST NOT leak to province center
    expect(json).not.toContain('น.ส. A');
    // And the scope label should say it's a center notification
    expect(json).toContain('ศูนย์กลาง');
  });

  it('omits the footer button when no confirmUrl', () => {
    const flex = buildAlertFlex({
      severity: 'high',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
    });
    const json = JSON.stringify(flex);
    expect(json).not.toContain('uri');
    expect(json).not.toContain('button');
  });

  it('uses Thai text throughout and red severity color for both severities', () => {
    for (const severity of ['high', 'emergency'] as const) {
      const flex = buildAlertFlex({
        severity,
        recipientScope: 'hospital_staff',
        hospitalName: HOSP,
        caseRef: CASE,
        acuityLabel: severity === 'emergency' ? 'ฉุกเฉิน' : undefined,
      });
      const json = JSON.stringify(flex);
      // red-ish severity color (LINE needs concrete hex, not CSS vars)
      expect(json).toMatch(/#(e|E)(f|F)4444/);
      expect(json).toContain('แจ้งเตือน');
    }
  });

  it('alertTitle produces a Thai alt-text equal to the title (server wraps bubble with title as altText)', () => {
    expect(alertTitle({ severity: 'high', hospitalName: HOSP })).toContain('เสี่ยงสูง');
    expect(alertTitle({ severity: 'emergency', hospitalName: HOSP })).toContain('ฉุกเฉิน');
    expect(alertTitle({ severity: 'high', hospitalName: HOSP })).toContain(HOSP);
  });
});

// buildAlertMessage renders the same scope-aware content as buildAlertFlex, but
// as the simple HTML/text the MOPH Alert Template API v3.1 expects
// (message_html / message_text fields — collection samples use
// <div><strong>…</strong></div>, not LINE Flex).
describe('buildAlertMessage', () => {
  it('full hospital-staff message carries severity, hospital, case ref, patient name, and confirm link', () => {
    const msg = buildAlertMessage({
      severity: 'high',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
      patientName: 'น.ส. A',
      confirmUrl: 'https://app/case/ANC-2026-0001',
    });
    expect(msg.html).toContain('เสี่ยงสูง');
    expect(msg.html).toContain(HOSP);
    expect(msg.html).toContain(CASE);
    expect(msg.html).toContain('น.ส. A');
    expect(msg.html).toContain('<div');
    expect(msg.html).toContain('<strong>');
    expect(msg.html).toContain('href="https://app/case/ANC-2026-0001"');
    // Plain text version: same content, no tags.
    expect(msg.text).toContain('เสี่ยงสูง');
    expect(msg.text).toContain(CASE);
    expect(msg.text).not.toContain('<');
    expect(msg.text).not.toContain('>');
  });

  it('aggregate detail carries NO case reference and NO patient name (PDPA), same as Flex', () => {
    const CID_CASE = 'ANC-3320500282121-G2';
    const msg = buildAlertMessage({
      severity: 'high',
      recipientScope: 'self_subscribed',
      detailLevel: 'aggregate',
      hospitalName: HOSP,
      caseRef: CID_CASE,
      patientName: 'น.ส. A',
      confirmUrl: 'https://app/case/x',
    });
    expect(msg.html).not.toContain(CID_CASE);
    expect(msg.html).not.toContain('3320500282121');
    expect(msg.html).not.toContain('น.ส. A');
    // …but still a usable alert: severity and origin hospital remain.
    expect(msg.html).toContain('เสี่ยงสูง');
    expect(msg.html).toContain(HOSP);
    // The deep link is withheld at aggregate detail too.
    expect(msg.html).not.toContain('https://app/case/x');
  });

  it('province_center scope contains NO patient name (PDPA)', () => {
    const msg = buildAlertMessage({
      severity: 'high',
      recipientScope: 'province_center',
      hospitalName: HOSP,
      caseRef: CASE,
      patientName: 'น.ส. A',
    });
    expect(msg.html).toContain(HOSP);
    expect(msg.html).toContain(CASE);
    expect(msg.html).not.toContain('น.ส. A');
    expect(msg.html).toContain('ศูนย์กลาง');
  });

  it('emergency severity uses its Thai label and escapes HTML-unsafe characters', () => {
    const msg = buildAlertMessage({
      severity: 'emergency',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
      patientName: '<script>&x',
    });
    expect(msg.html).toContain('ฉุกเฉิน');
    // Patient-controlled text must not inject markup.
    expect(msg.html).toContain('&lt;script&gt;&amp;x');
    expect(msg.html).not.toContain('<script>');
  });

  it('omits the anchor when no confirmUrl', () => {
    const msg = buildAlertMessage({
      severity: 'high',
      recipientScope: 'hospital_staff',
      hospitalName: HOSP,
      caseRef: CASE,
    });
    expect(msg.html).not.toContain('<a ');
    expect(msg.html).not.toContain('href');
  });
});
