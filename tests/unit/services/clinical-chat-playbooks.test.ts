// TDD — chat playbooks (2026-08-07).
//
// Playbooks carry kk-lrms's LOCAL conventions (CPD bands, partograph lines, ANC
// tiers, referral SLA, statistics reporting rules). The model cannot know these
// from its weights, and the medical ebook cannot tell it either.
//
// The load-bearing test here is anti-drift: every threshold in a playbook body
// is interpolated from the same constant the services enforce, so the bot can
// never quote a rule the app has stopped applying. That is the whole reason
// these are .ts modules rather than the reference chatbot's static .md skills.
import { describe, it, expect } from 'vitest';
import {
  CHAT_PLAYBOOKS,
  findPlaybook,
  playbookIds,
  renderPlaybookIndex,
} from '@/config/chat-playbooks';
import { RISK_LEVELS } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';
import { REFERRAL_SLA } from '@/config/referral-sla';
import { ANC_MAX_GA_WEEKS, ANC_LAST_VISIT_MAX_AGE_DAYS } from '@/config/anc-freshness';
import { chatToolSurface } from '@/config/clinical-chat-tools';

describe('chat playbooks — registry integrity', () => {
  it('has unique ids and a non-empty summary + body for each', () => {
    expect(CHAT_PLAYBOOKS.length).toBeGreaterThan(0);
    expect(new Set(playbookIds()).size).toBe(CHAT_PLAYBOOKS.length);
    for (const p of CHAT_PLAYBOOKS) {
      expect(p.summary.trim().length).toBeGreaterThan(10);
      expect(p.body.trim().length).toBeGreaterThan(100);
    }
  });

  it('resolves a known id and returns null for an unknown one', () => {
    expect(findPlaybook('cpd-interpretation')?.id).toBe('cpd-interpretation');
    expect(findPlaybook('no-such-playbook')).toBeNull();
  });

  it('renders an index listing every playbook id (the model can only ask for what it sees)', () => {
    const index = renderPlaybookIndex();
    for (const id of playbookIds()) {
      expect(index).toContain(id);
    }
    // Bodies must NOT ride along — the index is the cheap part.
    for (const p of CHAT_PLAYBOOKS) {
      expect(index).not.toContain(p.body);
    }
  });

  it('is reachable: load_playbook is on both mode surfaces', () => {
    expect(chatToolSurface('clinical')).toContain('load_playbook');
    expect(chatToolSurface('statistics')).toContain('load_playbook');
  });
});

describe('chat playbooks — thresholds track the enforcing constants (anti-drift)', () => {
  it('CPD bands come from RISK_LEVELS, not prose', () => {
    const body = findPlaybook('cpd-interpretation')?.body ?? '';
    expect(body).toContain(String(RISK_LEVELS[RiskLevel.MEDIUM].minScore));
    expect(body).toContain(String(RISK_LEVELS[RiskLevel.HIGH].minScore));
    // The action text a nurse sees on the dashboard is the action text quoted.
    expect(body).toContain(RISK_LEVELS[RiskLevel.HIGH].action);
    expect(body).toContain(RISK_LEVELS[RiskLevel.LOW].labelTh);
  });

  it('referral SLA hours come from REFERRAL_SLA', () => {
    const body = findPlaybook('referral-triage')?.body ?? '';
    expect(body).toContain(String(REFERRAL_SLA.overdueAfterHours));
    expect(body).toContain(String(REFERRAL_SLA.criticalAfterHours));
    // Only INITIATED referrals age — the rule that makes the count defensible.
    expect(body).toContain('INITIATED');
  });

  it('ANC freshness cutoffs come from anc-freshness config', () => {
    const body = findPlaybook('anc-followup')?.body ?? '';
    expect(body).toContain(String(ANC_MAX_GA_WEEKS));
    expect(body).toContain(String(ANC_LAST_VISIT_MAX_AGE_DAYS));
  });

  it('the statistics playbook pins the synonym rule and forbids self-computed totals', () => {
    const body = findPlaybook('province-statistics')?.body ?? '';
    // "รอคลอด" / "ในห้องคลอด" must resolve to the same figure.
    expect(body).toContain('labor_status = ACTIVE');
    expect(body).toContain('ห้ามคำนวณยอดรวมเอง');
  });

  it('the partograph playbook uses the CDSS severity vocabulary verbatim', () => {
    const body = findPlaybook('partograph-reading')?.body ?? '';
    for (const severity of ['INFO', 'WARN', 'ALERT', 'CRITICAL']) {
      expect(body).toContain(severity);
    }
  });
});
