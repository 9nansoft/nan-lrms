/* @vitest-environment jsdom */
// Consult thread — the conversation two teams have on ONE HUB consult,
// bound to the admission's AN.
//
// The rules under test:
//   1. Both sides read the SAME messages; bubbles sit on the sender's side.
//      The consult's own status moves are centered SYSTEM notes.
//   2. The requester's team and the hub's CLINICIANS may write; the hub's
//      nurses follow along read-only — the client mirror of the server's
//      rule (the server stays authoritative).
//   3. A closed (COMPLETED) consult's thread is a record: read-only for
//      everyone.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultThread } from '@/components/consult/ConsultThread';
import { renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';
import type { ConsultMessage, PatientConsult } from '@/types/api';

// The thread listens to the SSE stream for instant refreshes; the stream
// itself is covered by the useSSE tests — here it stays quiet.
vi.mock('@/hooks/useSSE', () => ({
  useSSE: () => ({ connectionState: 'connected' }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PATIENT_ID = '10670-69000123';
const MESSAGES_KEY = `/api/patients/${PATIENT_ID}/consults/consult-hub/messages`;

function hubConsult(over: Partial<PatientConsult> = {}): PatientConsult {
  return {
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
}

function message(over: Partial<ConsultMessage> = {}): ConsultMessage {
  return {
    id: 'msg-1',
    consultId: 'consult-hub',
    senderHospitalId: 'h-1', // the requester's side
    senderHospitalName: 'รพ.ชุมชนทดสอบ',
    senderHospitalHcode: '10670',
    senderCid: '2222222222222',
    senderName: 'พย.ศิริพร รักดี',
    senderRole: 'NURSE',
    body: 'ผู้ป่วยความดันสูงขึ้นเรื่อย ๆ',
    messageType: 'TEXT',
    createdAt: '2026-11-20T03:05:00.000Z',
    ...over,
  };
}

const REQUESTER_VIEWER = { role: 'NURSE', hospitalCode: '10670', userCid: '2222222222222' };
const HUB_CLINICIAN = { role: 'OBSTETRICIAN', hospitalCode: '10716', userCid: '9999999999999' };
const HUB_NURSE = { role: 'NURSE', hospitalCode: '10716', userCid: '8888888888888' };

type ThreadViewer = { role: string; hospitalCode: string; userCid: string };

function renderThread(
  viewer: ThreadViewer | null,
  options: { consult?: PatientConsult; messages?: ConsultMessage[] } = {},
) {
  const consult = options.consult ?? hubConsult();
  return renderWithSwr(
    <ConsultThread patientId={PATIENT_ID} consult={consult} viewer={viewer} />,
    { [MESSAGES_KEY]: { messages: options.messages ?? [] } },
  );
}

describe('ConsultThread', () => {
  it('anchors the thread to the admission and renders both sides and SYSTEM notes', async () => {
    renderThread(REQUESTER_VIEWER, {
      messages: [
        message(),
        message({
          id: 'msg-2',
          senderHospitalId: 'h-hub',
          senderHospitalName: 'โรงพยาบาลน่าน',
          senderCid: '9999999999999',
          senderName: 'นพ.สูติศาสตร์',
          body: 'ให้วัดความดันซ้ำในอีก 15 นาที',
        }),
        message({
          id: 'msg-3',
          senderHospitalId: 'h-1',
          senderCid: '',
          senderName: 'ระบบ',
          body: 'กำลังปรึกษา — เปิดบทสนทนาให้ทั้งสองฝั่งโต้ตอบได้',
          messageType: 'SYSTEM',
        }),
      ],
    });

    const thread = screen.getByTestId('consult-thread');
    expect(within(thread).getByText(/บทสนทนา · AN 69000123/)).toBeInTheDocument();
    const bubbles = await within(thread).findAllByTestId('consult-thread-message');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0]).toHaveTextContent('พย.ศิริพร รักดี');
    expect(bubbles[1]).toHaveTextContent('นพ.สูติศาสตร์');
    // The requester reads their own team's bubble on the right, the hub's
    // on the left; the status note is a centered SYSTEM line.
    expect(bubbles[0]).toHaveClass('self-end');
    expect(bubbles[1]).toHaveClass('self-start');
    expect(within(thread).getAllByTestId('consult-thread-system')).toHaveLength(1);
  });

  it('flips the sides when the viewer is the hub clinician', async () => {
    renderThread(HUB_CLINICIAN, {
      messages: [
        message(),
        message({
          id: 'msg-2',
          senderHospitalId: 'h-hub',
          senderHospitalName: 'โรงพยาบาลน่าน',
          senderName: 'นพ.สูติศาสตร์',
          body: 'ให้วัดความดันซ้ำ',
        }),
      ],
    });

    const bubbles = await screen.findAllByTestId('consult-thread-message');
    expect(bubbles[0]).toHaveClass('self-start');
    expect(bubbles[1]).toHaveClass('self-end');
  });

  it('sends the message through the messages API, then clears the draft', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      status: 201,
      body: { message: message({ id: 'msg-9', body: 'รบกวนช่วยดูทางแพทย์หน่อยค่ะ' }) },
    }));
    renderThread(REQUESTER_VIEWER);

    const input = await screen.findByTestId('consult-thread-input');
    await userEvent.type(input, 'รบกวนช่วยดูทางแพทย์หน่อยค่ะ');
    await userEvent.click(screen.getByTestId('consult-thread-send'));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        MESSAGES_KEY,
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({ body: 'รบกวนช่วยดูทางแพทย์หน่อยค่ะ' }),
        }),
      ),
    );
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('lets the hub clinician write but keeps the hub nurse read-only', async () => {
    const clinician = renderThread(HUB_CLINICIAN);
    expect(await clinician.findByTestId('consult-thread-input')).toBeInTheDocument();
    clinician.unmount();

    const nurse = renderThread(HUB_NURSE);
    await waitFor(() =>
      expect(nurse.queryByTestId('consult-thread-input')).not.toBeInTheDocument(),
    );
    expect(
      nurse.getByText(/อ่านบทสนทนาได้อย่างเดียว/),
    ).toBeInTheDocument();
  });

  it('lets the hospital team write on an INTERNAL consult, bubbles split by sender CID', async () => {
    const internal = hubConsult({
      consultScope: 'INTERNAL',
      targetHospitalId: null,
      targetHospitalName: null,
      targetHospitalHcode: null,
    });
    renderThread(REQUESTER_VIEWER, {
      consult: internal,
      messages: [
        message(),
        message({ id: 'msg-2', senderCid: '3333333333333', senderName: 'พย.อีกคนหนึ่ง' }),
      ],
    });

    // The same-hospital team writes while the consult is open.
    expect(await screen.findByTestId('consult-thread-input')).toBeInTheDocument();
    const bubbles = await screen.findAllByTestId('consult-thread-message');
    // One hospital only — the viewer's own CID sits right, colleagues left.
    expect(bubbles[0]).toHaveClass('self-end');
    expect(bubbles[1]).toHaveClass('self-start');
  });

  it('shows a closed consult as a read-only record, even to its answerer', async () => {
    renderThread(HUB_CLINICIAN, {
      consult: hubConsult({ status: 'COMPLETED' }),
      messages: [message()],
    });

    // The thread mounts read-only; wait out the SWR fetch so its settle
    // happens inside the test, not after it.
    expect(await screen.findByText('ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว')).toBeInTheDocument();
    expect(screen.queryByTestId('consult-thread-input')).not.toBeInTheDocument();
  });

  it('shows the refusal of the server in Thai instead of failing silently', async () => {
    stubMutations(() => ({
      ok: false,
      status: 403,
      body: {
        error: {
          code: 'CONSULT_REJECTED',
          message: 'ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว',
        },
      },
    }));
    renderThread(REQUESTER_VIEWER);

    const input = await screen.findByTestId('consult-thread-input');
    await userEvent.type(input, 'ข้อความ');
    await userEvent.click(screen.getByTestId('consult-thread-send'));

    expect(
      await screen.findByText('ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว'),
    ).toBeInTheDocument();
  });
});
