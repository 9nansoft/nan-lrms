/* @vitest-environment jsdom */
// Consult card — the consults of one admission, the request form, and the
// follow-up writes that move a consult on.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultCard } from '@/components/patient/detail/ConsultCard';
import { usePatientConsults } from '@/hooks/usePatientConsults';
import type { ConsultDoctor, ConsultHubInfo, PatientConsult } from '@/types/api';
import { renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PATIENT_ID = '10670-69000123';
const CONSULT_KEY = `/api/patients/${PATIENT_ID}/consults`;

const doctor: ConsultDoctor = {
  id: 'doc-1',
  cid: '1111111111111',
  name: 'นพ.สมชาย ใจดี',
  position: 'สูติแพทย์',
  phoneNumber: '089-123-4567',
};

function consult(over: Partial<PatientConsult> = {}): PatientConsult {
  return {
    id: 'consult-1',
    an: '69000123',
    hospitalId: 'h-1',
    doctorId: 'doc-1',
    doctorCid: '1111111111111',
    doctorName: 'นพ.สมชาย ใจดี',
    doctorPosition: 'สูติแพทย์',
    doctorPhone: '089-123-4567',
    reason: 'ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์',
    status: 'REQUESTED',
    advice: null,
    requestedByCid: '2222222222222',
    requestedByName: 'พย.ศิริพร รักดี',
    consultedAt: null,
    createdAt: '2026-11-20T03:00:00.000Z',
    consultScope: 'INTERNAL',
    targetHospitalId: null,
    targetHospitalName: null,
    targetHospitalHcode: null,
    urgencyLevel: 'ROUTINE',
    answeredByName: null,
    messageCount: 0,
    unreadCount: 0,
    ...over,
  };
}

const noop = async (): Promise<undefined> => undefined;

function renderCard(props: Partial<Parameters<typeof ConsultCard>[0]> = {}) {
  return render(
    <ConsultCard
      patientId={PATIENT_ID}
      consults={[consult()]}
      doctors={[doctor]}
      onRequestConsult={noop}
      onUpdateConsult={noop}
      {...props}
    />,
  );
}

/** The real hook, so the writes go through the API boundary for real. */
function ConsultHarness() {
  const { consults, doctors, hub, isLoading, error, requestConsult, updateConsult } =
    usePatientConsults(PATIENT_ID);
  return (
    <ConsultCard
      patientId={PATIENT_ID}
      consults={consults}
      doctors={doctors}
      hub={hub}
      isLoading={isLoading}
      error={error}
      onRequestConsult={requestConsult}
      onUpdateConsult={updateConsult}
    />
  );
}

describe('ConsultCard', () => {
  it('shows who was consulted, why, when, the state and the advice', () => {
    renderCard({
      consults: [consult({ status: 'COMPLETED', advice: 'แนะนำลดเบาและเฝ้าระวังความดัน' })],
    });

    const row = screen.getByTestId('consult-row');
    expect(within(row).getByText('นพ.สมชาย ใจดี')).toBeInTheDocument();
    expect(within(row).getByText('สูติแพทย์')).toBeInTheDocument();
    expect(within(row).getByText('โทร 089-123-4567')).toBeInTheDocument();
    expect(
      within(row).getByText('ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์'),
    ).toBeInTheDocument();
    expect(within(row).getByText('พย.ศิริพร รักดี')).toBeInTheDocument();
    expect(within(row).getByText('ตอบแล้ว')).toBeInTheDocument();
    expect(within(row).getByText(/แนะนำลดเบาและเฝ้าระวังความดัน/)).toBeInTheDocument();
  });

  it('says so when this admission has no consult yet', () => {
    renderCard({ consults: [] });
    expect(screen.getByText('ยังไม่มีการปรึกษา')).toBeInTheDocument();
  });

  it('says what to do when neither roster has consult doctors, and hides the form', () => {
    renderCard({ doctors: [] });
    expect(
      screen.getByText(
        'ยังไม่ได้เพิ่มรายชื่อแพทย์ที่ปรึกษาได้ — ให้ผู้ดูแลระบบเพิ่มรายชื่อของโรงพยาบาลนี้ และของโรงพยาบาลแม่ข่าย (รพ.น่าน) ที่หน้า “ตั้งค่า → โรงพยาบาล”',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('แพทย์ที่ต้องการปรึกษา')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ขอปรึกษา' })).toBeNull();
  });

  it('keeps the rest of the page usable when the feed failed', () => {
    renderCard({ error: new Error('boom'), consults: [] });
    expect(
      screen.getByText('ดึงข้อมูลการปรึกษาไม่สำเร็จ — ข้อมูลส่วนอื่นยังใช้ได้ตามปกติ'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('ไม่สามารถแสดงรายการปรึกษาได้');
  });
});

describe('the consult writes', () => {
  it('the request form POSTs the doctor and the reason, then refreshes the list', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      status: 201,
      body: { consult: consult({ id: 'consult-2', status: 'REQUESTED' }) },
    }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [consult()], doctors: [doctor] },
    });

    await userEvent.selectOptions(
      await screen.findByLabelText('แพทย์ที่ต้องการปรึกษา'),
      'doc-1',
    );
    await userEvent.type(
      screen.getByLabelText('เหตุผลที่ขอปรึกษา'),
      'ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์',
    );
    await userEvent.click(screen.getByRole('button', { name: 'ขอปรึกษา' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        CONSULT_KEY,
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({
            doctorId: 'doc-1',
            reason: 'ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์',
            mode: 'INTERNAL',
          }),
        }),
      ),
    );
  });

  it('the status update PATCHes the new state and the advice', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      body: { consult: consult({ status: 'COMPLETED', advice: 'แนะนำลดเบาและเฝ้าระวังความดัน' }) },
    }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [consult()], doctors: [doctor] },
    });

    const row = await screen.findByTestId('consult-row');
    await userEvent.type(
      within(row).getByLabelText('คำแนะนำจากแพทย์'),
      'แนะนำลดเบาและเฝ้าระวังความดัน',
    );
    await userEvent.click(within(row).getByRole('button', { name: 'ตอบแล้ว' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        `${CONSULT_KEY}/consult-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            status: 'COMPLETED',
            advice: 'แนะนำลดเบาและเฝ้าระวังความดัน',
          }),
        }),
      ),
    );
  });

  it('marks the consult reached without advice', async () => {
    const fetchSpy = stubMutations(() => ({ ok: true, body: { consult: consult({ status: 'CONTACTED' }) } }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [consult()], doctors: [doctor] },
    });

    const row = await screen.findByTestId('consult-row');
    await userEvent.click(within(row).getByRole('button', { name: 'ติดต่อแล้ว' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        `${CONSULT_KEY}/consult-1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONTACTED', advice: '' }),
        }),
      ),
    );
  });

  it('shows the refusal of the server in Thai instead of failing silently', async () => {
    stubMutations(() => ({
      ok: false,
      status: 400,
      body: {
        error: {
          code: 'CONSULT_REJECTED',
          message: 'ไม่พบแพทย์ที่ปรึกษาได้ในรายชื่อของโรงพยาบาลนี้',
        },
      },
    }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [], doctors: [doctor] },
    });

    await userEvent.selectOptions(
      await screen.findByLabelText('แพทย์ที่ต้องการปรึกษา'),
      'doc-1',
    );
    await userEvent.type(screen.getByLabelText('เหตุผลที่ขอปรึกษา'), 'ความดันสูงตลอด');
    await userEvent.click(screen.getByRole('button', { name: 'ขอปรึกษา' }));

    expect(
      await screen.findByText('ไม่พบแพทย์ที่ปรึกษาได้ในรายชื่อของโรงพยาบาลนี้'),
    ).toBeInTheDocument();
  });

  it('refuses to post without a doctor or a reason, and says which one is missing', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [], doctors: [doctor] },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'ขอปรึกษา' }));
    expect(await screen.findByText('กรุณาเลือกแพทย์ที่ต้องการปรึกษา')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── HUB consults — the question sent up to the provincial hub ──────────────

const hub: ConsultHubInfo = {
  hcode: '10716',
  name: 'โรงพยาบาลน่าน',
  available: true,
  doctors: [
    {
      id: 'doc-hub-1',
      cid: '9999999999999',
      name: 'นพ.สูติศาสตร์ แม่ข่าย',
      position: 'สูติแพทย์',
      phoneNumber: null,
    },
  ],
};

function hubConsult(over: Partial<PatientConsult> = {}): PatientConsult {
  return consult({
    id: 'consult-hub',
    doctorId: 'doc-hub-1',
    doctorCid: '9999999999999',
    doctorName: 'นพ.สูติศาสตร์ แม่ข่าย',
    doctorPhone: null,
    consultScope: 'HUB',
    targetHospitalId: 'h-hub',
    targetHospitalName: 'โรงพยาบาลน่าน',
    targetHospitalHcode: '10716',
    urgencyLevel: 'URGENT',
    ...over,
  });
}

const HUB_VIEWER = { role: 'OBSTETRICIAN', hospitalCode: '10716', userCid: '9999999999999' };
const REQUESTER_VIEWER = { role: 'NURSE', hospitalCode: '10670', userCid: '2222222222222' };

describe('ConsultCard — HUB consults (ปรึกษาขึ้นสู่โรงพยาบาลแม่ข่าย)', () => {
  it('shows the urgency, the target hospital and the waiting note to the requester', () => {
    renderCard({
      consults: [hubConsult()],
      hub,
      viewer: REQUESTER_VIEWER,
    });

    const row = screen.getByTestId('consult-row');
    expect(within(row).getByText('ด่วน')).toBeInTheDocument();
    expect(within(row).getByText('ที่ โรงพยาบาลน่าน')).toBeInTheDocument();
    expect(
      within(row).getByText(/รอคำตอบจากทีมสูติศาสตร์ โรงพยาบาลน่าน/),
    ).toBeInTheDocument();
    // The requester progresses but does not write the advice.
    expect(within(row).getByRole('button', { name: 'ติดต่อแล้ว' })).toBeInTheDocument();
    expect(within(row).queryByLabelText('คำแนะนำจากแพทย์')).toBeNull();
    expect(within(row).queryByRole('button', { name: 'ตอบแล้ว' })).toBeNull();
  });

  it('gives the hub clinician the advice box and the answer button', () => {
    renderCard({
      consults: [hubConsult()],
      hub,
      viewer: HUB_VIEWER,
    });

    const row = screen.getByTestId('consult-row');
    expect(within(row).getByLabelText('คำแนะนำจากแพทย์')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'ตอบแล้ว' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'ติดต่อแล้ว' })).toBeNull();
  });

  it('offers the thread on every consult, with its message count', () => {
    renderCard({
      consults: [consult({ messageCount: 1 }), hubConsult({ messageCount: 2 })],
      hub,
      viewer: REQUESTER_VIEWER,
    });

    const rows = screen.getAllByTestId('consult-row');
    expect(within(rows[0]).getByTestId('consult-thread-toggle')).toHaveTextContent('บทสนทนา (1)');
    expect(within(rows[1]).getByTestId('consult-thread-toggle')).toHaveTextContent('บทสนทนา (2)');
  });

  it('opens the conversation thread in place, and hides it again', async () => {
    stubMutations();
    renderCard({ consults: [hubConsult()], hub, viewer: REQUESTER_VIEWER });

    await userEvent.click(screen.getByTestId('consult-thread-toggle'));
    const thread = await screen.findByTestId('consult-thread');
    // The thread names the admission it belongs to — two patients never blur.
    expect(within(thread).getByText(/บทสนทนา · AN 69000123/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('consult-thread-toggle'));
    await waitFor(() => expect(screen.queryByTestId('consult-thread')).toBeNull());
  });

  it('a hospital with an empty own roster still reaches the hub — the form opens in HUB mode', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      status: 201,
      body: { consult: hubConsult({ status: 'REQUESTED' }) },
    }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [], doctors: [], hub },
    });

    // The hub doctors are the only ones the form can offer, so the form
    // opens with the hub mode already selected.
    await userEvent.selectOptions(
      await screen.findByLabelText(/แพทย์ที่ต้องการปรึกษา/),
      'doc-hub-1',
    );
    await userEvent.type(screen.getByLabelText('เหตุผลที่ขอปรึกษา'), 'ความดันสูงมาก');
    await userEvent.click(screen.getByRole('button', { name: 'ขอปรึกษา' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        CONSULT_KEY,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            doctorId: 'doc-hub-1',
            reason: 'ความดันสูงมาก',
            mode: 'HUB',
            urgency: 'ROUTINE',
          }),
        }),
      ),
    );
  });

  it('the request form offers the hub mode with an urgency, and POSTs it', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      status: 201,
      body: { consult: hubConsult({ status: 'REQUESTED' }) },
    }));
    renderWithSwr(<ConsultHarness />, {
      [CONSULT_KEY]: { consults: [], doctors: [doctor], hub },
    });

    await userEvent.click(await screen.findByRole('button', { name: /ทีมสูติศาสตร์ โรงพยาบาลน่าน/ }));
    await userEvent.selectOptions(await screen.findByLabelText(/แพทย์ที่ต้องการปรึกษา/), 'doc-hub-1');
    await userEvent.selectOptions(await screen.findByLabelText('ความเร่งด่วน'), 'URGENT');
    await userEvent.type(screen.getByLabelText('เหตุผลที่ขอปรึกษา'), 'ความดันสูงมาก');
    await userEvent.click(screen.getByRole('button', { name: 'ขอปรึกษา' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        CONSULT_KEY,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            doctorId: 'doc-hub-1',
            reason: 'ความดันสูงมาก',
            mode: 'HUB',
            urgency: 'URGENT',
          }),
        }),
      ),
    );
  });

  it('lets a parent hospital viewer (รพ.แม่ข่าย) proactively inbox the patient hospital without picking a doctor', async () => {
    const onRequestConsult = vi.fn().mockResolvedValue(
      hubConsult({
        id: 'proactive-1',
        doctorId: null,
        status: 'CONTACTED',
        messageCount: 1,
      }),
    );
    renderCard({
      consults: [],
      doctors: [],
      hub: null,
      viewer: HUB_VIEWER,
      onRequestConsult,
    });

    await userEvent.selectOptions(await screen.findByLabelText('ความเร่งด่วน'), 'EMERGENCY');
    await userEvent.type(
      screen.getByLabelText('ข้อความแจ้งเตือน / คำแนะนำถึงโรงพยาบาลต้นทาง'),
      'พบความเสี่ยงจากผลประเมิน ให้เฝ้าระวังใกล้ชิด',
    );
    await userEvent.click(screen.getByRole('button', { name: 'ส่งข้อความเตือน' }));

    await waitFor(() =>
      expect(onRequestConsult).toHaveBeenCalledWith({
        reason: 'พบความเสี่ยงจากผลประเมิน ให้เฝ้าระวังใกล้ชิด',
        mode: 'HUB',
        urgency: 'EMERGENCY',
      }),
    );
  });
});
