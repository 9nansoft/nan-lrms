/* @vitest-environment jsdom */
// The hub inbox list — the thread toggle lives on EVERY row, COMPLETED
// included: once the consult is answered the thread is the record of the
// case, and the record must stay readable. The answer expansion stays a
// separate control for consults still open.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultInboxList } from '@/components/consult/ConsultInboxList';
import { renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';
import type { HubConsultInboxItem, PatientConsult } from '@/types/api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The thread listens to the SSE stream; the stream itself is covered in the
// useSSE tests — here it stays quiet.
vi.mock('@/hooks/useSSE', () => ({
  useSSE: () => ({ connectionState: 'connected' }),
}));

const HUB_VIEWER = { role: 'OBSTETRICIAN', hospitalCode: '10716', userCid: '9999999999999' };
const noop = async (): Promise<undefined> => undefined;

function consult(over: Partial<PatientConsult> = {}): HubConsultInboxItem {
  const base: PatientConsult = {
    id: 'consult-hub',
    an: '69000123',
    hospitalId: 'h-1',
    doctorId: 'doc-hub-1',
    doctorCid: '9999999999999',
    doctorName: 'นพ.สูติศาสตร์ แม่ข่าย',
    doctorPosition: 'สูติแพทย์',
    doctorPhone: null,
    reason: 'ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์',
    status: 'CONTACTED',
    advice: null,
    requestedByCid: '2222222222222',
    requestedByName: 'พย.ศิริพร รักดี',
    consultedAt: null,
    createdAt: '2026-11-20T03:00:00.000Z',
    consultScope: 'HUB',
    targetHospitalId: 'h-hub',
    targetHospitalName: 'โรงพยาบาลน่าน',
    targetHospitalHcode: '10716',
    urgencyLevel: 'URGENT',
    answeredByName: null,
    messageCount: 0,
    unreadCount: 0,
    ...over,
  };
  return {
    ...base,
    patientName: 'สมหญิง ใจดี',
    patientUrlId: '10670-69000123',
    requesterHospitalName: 'รพ.ชุมชนทดสอบ',
  };
}

const MESSAGES_KEY = `/api/patients/10670-69000123/consults/consult-hub/messages`;

describe('ConsultInboxList — the thread toggle', () => {
  it('shows the conversation count and opens the thread on a row still open', async () => {
    renderWithSwr(
      <ConsultInboxList
        consults={[consult({ messageCount: 2 })]}
        viewer={HUB_VIEWER}
        onAnswer={noop}
        onProgress={noop}
      />,
      { [MESSAGES_KEY]: { messages: [] } },
    );

    const row = screen.getByTestId('consult-inbox-row');
    await userEvent.click(within(row).getByTestId('consult-thread-toggle'));

    const thread = await screen.findByTestId('consult-thread');
    expect(within(thread).getByText(/บทสนทนา · AN 69000123/)).toBeInTheDocument();
    // The clinician of the hub may write while the consult is open.
    expect(await screen.findByTestId('consult-thread-input')).toBeInTheDocument();
  });

  it('keeps the thread readable after the consult is answered — read-only', async () => {
    renderWithSwr(
      <ConsultInboxList
        consults={[consult({ status: 'COMPLETED', messageCount: 3 })]}
        viewer={HUB_VIEWER}
        onAnswer={noop}
        onProgress={noop}
      />,
      { [MESSAGES_KEY]: { messages: [] } },
    );

    const row = screen.getByTestId('consult-inbox-row');
    expect(within(row).getByTestId('consult-thread-toggle')).toHaveTextContent('บทสนทนา (3)');
    await userEvent.click(within(row).getByTestId('consult-thread-toggle'));

    expect(await screen.findByTestId('consult-thread')).toBeInTheDocument();
    // A closed consult's thread is the record — no compose box, for anyone.
    expect(screen.queryByTestId('consult-thread-input')).not.toBeInTheDocument();
    expect(
      screen.getByText('ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว'),
    ).toBeInTheDocument();
    // The answer expansion never appeared for a completed consult.
    expect(within(row).queryByRole('button', { name: 'ตอบคำปรึกษา' })).toBeNull();
  });

  it('the answer expansion stays a separate control with the advice box', async () => {
    stubMutations();
    renderWithSwr(
      <ConsultInboxList
        consults={[consult()]}
        viewer={HUB_VIEWER}
        onAnswer={noop}
        onProgress={noop}
      />,
      { [MESSAGES_KEY]: { messages: [] } },
    );

    await userEvent.click(screen.getByRole('button', { name: 'ตอบคำปรึกษา' }));
    expect(await screen.findByLabelText('คำแนะนำจากแพทย์')).toBeInTheDocument();
    // Opening the answer box did not open the thread with it.
    expect(screen.queryByTestId('consult-thread')).toBeNull();
  });
});
