// Webhook & API documentation body of the public /about page (moved verbatim
// out of page.tsx; classes put on the direction-C tokens).
import { Activity, CheckCircle2, Globe, Key, Send, XCircle } from 'lucide-react';
import { CodeBlock, EndpointBadge } from './about-blocks';

export function WebhookApiContent() {
  return (
    <div className="space-y-8">
      {/* Overview */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Globe className="h-6 w-6 shrink-0 text-brand mt-1" />
          <div>
            <h3 className="text-body-lg font-semibold text-ink mb-2">ภาพรวม</h3>
            <p className="text-ink-muted">
              สำหรับ<strong>โรงพยาบาลที่ไม่ได้ใช้ HOSxP</strong> (เช่น รพ.เอกชน หรือ รพ.ที่ใช้ HIS
              อื่น) สามารถส่งข้อมูลผู้คลอดเข้าระบบ NN-LRMS ได้ผ่าน <strong>Webhook API</strong>{' '}
              โดยตรง ข้อมูลจะถูกประมวลผลเหมือนกันทุกประการ — คำนวณ CPD Score, ตรวจจับการส่งต่อ,
              แจ้งเตือนความเสี่ยงสูง, และแสดงบน Dashboard แบบ Real-time
            </p>
          </div>
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-brand" />
          <h3 className="text-body-lg font-semibold text-ink">การยืนยันตัวตน (Authentication)</h3>
        </div>
        <p className="text-ink-muted">
          ใช้ <strong>Bearer Token</strong> ผ่าน HTTP Header ทุกโรงพยาบาลจะได้รับ API Key เฉพาะ
          ที่ออกให้โดยผู้ดูแลระบบ สสจ.น่าน API Key จะแสดงเพียงครั้งเดียวตอนสร้าง —
          กรุณาบันทึกไว้ให้ดี
        </p>
        <CodeBlock title="HTTP Header">{`Authorization: Bearer kklrms_a1b2c3d4e5f6...`}</CodeBlock>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg border border-border p-3">
            <div className="text-caption text-ink-muted mb-1">รูปแบบ API Key</div>
            <div className="font-mono text-body text-ink">kklrms_ + 40 hex chars</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-caption text-ink-muted mb-1">การเก็บรักษา</div>
            <div className="text-body text-ink">SHA-256 Hash (ปลอดภัย)</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-caption text-ink-muted mb-1">การเพิกถอน</div>
            <div className="text-body text-ink">ยกเลิกได้ทันทีโดย Admin</div>
          </div>
        </div>
      </div>

      {/* Endpoint: Patient Data */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Send className="h-5 w-5 text-brand" />
          <h3 className="text-body-lg font-semibold text-ink">Endpoint: ส่งข้อมูลผู้คลอด</h3>
        </div>
        <EndpointBadge method="POST" path="/api/webhooks/patient-data" />
        <p className="text-ink-muted">
          ส่งข้อมูลผู้คลอดเข้าระบบ รองรับสูงสุด <strong>100 ราย</strong> ต่อ request ระบบจะ upsert
          (สร้างใหม่หรืออัปเดต) โดยอิงจากเลข AN รองรับ 2 โหมด:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-brand/30 bg-brand-soft p-4">
            <div className="font-semibold text-brand mb-1 font-mono text-body">
              &quot;mode&quot;: &quot;incremental&quot;
            </div>
            <p className="text-body text-brand">
              <strong>(ค่าเริ่มต้น)</strong> เพิ่ม/อัปเดตเฉพาะผู้คลอดที่ส่งมา
              ผู้คลอดที่ไม่ได้ส่งจะยังคงสถานะเดิม เหมาะสำหรับส่งข้อมูลเฉพาะรายที่มีการเปลี่ยนแปลง
            </p>
          </div>
          <div className="rounded-lg border border-warn/40 bg-warn-tint p-4">
            <div className="font-semibold text-warn-text mb-1 font-mono text-body">
              &quot;mode&quot;: &quot;full_snapshot&quot;
            </div>
            <p className="text-body text-warn-text">
              <strong>ส่งรายชื่อทั้งหมด</strong> — ผู้คลอดที่อยู่ในระบบแต่ไม่อยู่ใน payload
              จะถูกเปลี่ยนสถานะเป็น DELIVERED อัตโนมัติ เหมาะสำหรับระบบที่ส่งข้อมูลเป็นรอบ (เช่น ทุก
              5 นาที)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Request */}
          <div>
            <h3 className="text-body font-semibold text-ink-muted mb-2">Request Body (JSON)</h3>
            <CodeBlock title="request.json">
              {`{
        "mode": "full_snapshot",
        "patients": [
          {
      "hn": "HN-001",
      "an": "AN-001",
      "name": "นาง ทดสอบ ระบบ",
      "cid": "1100500012345",
      "age": 28,
      "gravida": 1,
      "ga_weeks": 41,
      "anc_count": 3,
      "admit_date": "2026-03-08T08:00:00+07:00",
      "height_cm": 148,
      "weight_kg": 75,
      "weight_diff_kg": 20,
      "fundal_height_cm": 37,
      "us_weight_g": 4000,
      "hematocrit_pct": 29,
      "labor_status": "ACTIVE"
          }
        ]
      }`}
            </CodeBlock>
          </div>

          {/* Response */}
          <div>
            <h3 className="text-body font-semibold text-ink-muted mb-2">Response (200 OK)</h3>
            <CodeBlock title="response.json">
              {`{
        "success": true,
        "patientsProcessed": 1,
        "newAdmissions": 1,
        "discharges": 0,
        "transfers": 0,
        "timestamp": "2026-03-08T08:00:05Z"
      }`}
            </CodeBlock>
            <div className="mt-4">
              <h3 className="text-body font-semibold text-ink-muted mb-2">Response Fields</h3>
              <div className="space-y-1.5 text-body">
                <div className="flex gap-2">
                  <code className="text-brand font-mono shrink-0">patientsProcessed</code>
                  <span className="text-ink-muted">— จำนวนผู้คลอดที่ประมวลผลสำเร็จ</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-brand font-mono shrink-0">newAdmissions</code>
                  <span className="text-ink-muted">— จำนวนผู้คลอดรายใหม่ (ไม่เคยอยู่ในระบบ)</span>
                </div>
                <div className="flex gap-2">
                  <code className="text-brand font-mono shrink-0">discharges</code>
                  <span className="text-ink-muted">
                    — จำนวนที่ถูกเปลี่ยนเป็น DELIVERED (เฉพาะ full_snapshot mode)
                  </span>
                </div>
                <div className="flex gap-2">
                  <code className="text-brand font-mono shrink-0">transfers</code>
                  <span className="text-ink-muted">— จำนวนที่ตรวจพบว่าเป็นการย้าย รพ.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fields Table */}
      <div className="space-y-3">
        <h3 className="text-body-lg font-semibold text-ink">รายละเอียด Fields ข้อมูลผู้คลอด</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-body">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="py-2.5 pr-3 font-semibold text-ink">Field</th>
                <th className="py-2.5 pr-3 font-semibold text-ink">Type</th>
                <th className="py-2.5 pr-3 font-semibold text-ink">จำเป็น</th>
                <th className="py-2.5 font-semibold text-ink">คำอธิบาย</th>
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-brand">hn</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <CheckCircle2 size={16} className="text-ok" />
                </td>
                <td className="py-2.5">เลข HN (Hospital Number)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-brand">an</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <CheckCircle2 size={16} className="text-ok" />
                </td>
                <td className="py-2.5">เลข AN (Admission Number) — ใช้เป็น primary key</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-brand">name</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <CheckCircle2 size={16} className="text-ok" />
                </td>
                <td className="py-2.5">ชื่อ-สกุลผู้คลอด (เข้ารหัสอัตโนมัติ ตาม PDPA)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-brand">age</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <CheckCircle2 size={16} className="text-ok" />
                </td>
                <td className="py-2.5">อายุมารดา (ปี)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-brand">admit_date</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <CheckCircle2 size={16} className="text-ok" />
                </td>
                <td className="py-2.5">วันเวลา Admit (ISO 8601 เช่น 2026-03-08T08:00:00+07:00)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">cid</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">
                  เลขบัตรประชาชน 13 หลัก (เข้ารหัส+Hash สำหรับตรวจจับการย้าย รพ.)
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">gravida</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">จำนวนครรภ์ (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">ga_weeks</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">อายุครรภ์ (สัปดาห์) (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">anc_count</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">จำนวนครั้งที่ฝากครรภ์ (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">height_cm</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">ส่วนสูง (ซม.) (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">weight_kg</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">น้ำหนักมารดาปัจจุบัน (กก.)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">weight_diff_kg</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">ส่วนต่างน้ำหนัก (กก.) (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">fundal_height_cm</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">ยอดมดลูก (ซม.) (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">us_weight_g</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">น้ำหนักเด็กจาก U/S (กรัม) (ปัจจัย CPD)</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2.5 pr-3 font-mono text-ink-muted">hematocrit_pct</td>
                <td className="py-2.5 pr-3">number</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">ค่า Hematocrit (%) (ปัจจัย CPD)</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-mono text-ink-muted">labor_status</td>
                <td className="py-2.5 pr-3">string</td>
                <td className="py-2.5 pr-3">
                  <XCircle size={16} className="text-ink-muted" />
                </td>
                <td className="py-2.5">
                  สถานะ: <code className="bg-surface-muted px-1 rounded">ACTIVE</code> (ค่าเริ่มต้น)
                  หรือ <code className="bg-surface-muted px-1 rounded">DELIVERED</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-body text-ink-muted">
          หมายเหตุ: ยิ่งส่งข้อมูล optional fields (ปัจจัย CPD) ครบถ้วน คะแนน CPD Risk Score
          จะแม่นยำยิ่งขึ้น ปัจจัยที่ไม่ได้ส่งจะแสดงเป็น &ldquo;ข้อมูลไม่ครบ&rdquo;
          ในหน้ารายละเอียดผู้คลอด
        </p>

        <div className="rounded-xl bg-warn-tint border border-warn/40 p-4 mt-4">
          <h3 className="font-semibold text-warn-text text-body mb-2">
            ข้อแนะนำ: เลือกโหมดที่เหมาะสม
          </h3>
          <ul className="text-body text-warn-text space-y-1.5 list-disc list-inside">
            <li>
              <strong>full_snapshot</strong> — ใช้เมื่อระบบ HIS ส่งรายชื่อผู้คลอดทั้งหมดเป็นรอบ (ทุก
              5-30 นาที) ผู้คลอดที่จำหน่ายแล้วจะหายจาก payload โดยอัตโนมัติ ระบบจะเปลี่ยนสถานะเป็น
              DELIVERED ให้
            </li>
            <li>
              <strong>incremental</strong> — ใช้เมื่อส่งข้อมูลเฉพาะรายที่มีการเปลี่ยนแปลง ต้องส่ง{' '}
              <code className="bg-warn-tint px-1 rounded">labor_status: &quot;DELIVERED&quot;</code>{' '}
              เมื่อผู้คลอดจำหน่าย มิฉะนั้นผู้คลอดจะแสดงเป็น ACTIVE ตลอด
            </li>
          </ul>
        </div>
      </div>

      {/* Error Codes */}
      <div className="space-y-3">
        <h3 className="text-body-lg font-semibold text-ink">HTTP Status Codes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-ok/40 bg-ok-tint p-3 flex gap-3">
            <span className="shrink-0 font-mono font-bold text-ok-text">200</span>
            <span className="text-body text-ok-text">สำเร็จ — ข้อมูลถูกประมวลผลเรียบร้อย</span>
          </div>
          <div className="rounded-lg border border-warn/40 bg-warn-tint p-3 flex gap-3">
            <span className="shrink-0 font-mono font-bold text-warn-text">400</span>
            <span className="text-body text-warn-text">
              Payload ไม่ถูกต้อง — ตรวจสอบ JSON format และ required fields
            </span>
          </div>
          <div className="rounded-lg border border-danger/40 bg-danger-tint p-3 flex gap-3">
            <span className="shrink-0 font-mono font-bold text-danger-text">401</span>
            <span className="text-body text-danger-text">
              ไม่ได้ยืนยันตัวตน — API Key หาย ไม่ถูกต้อง หรือถูกเพิกถอน
            </span>
          </div>
          <div className="rounded-lg border border-border bg-surface-muted p-3 flex gap-3">
            <span className="shrink-0 font-mono font-bold text-ink">500</span>
            <span className="text-body text-ink">ข้อผิดพลาดภายในระบบ — ติดต่อผู้ดูแลระบบ</span>
          </div>
        </div>
      </div>

      {/* Admin API */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-brand" />
          <h3 className="text-body-lg font-semibold text-ink">Admin API — จัดการ API Keys</h3>
        </div>
        <p className="text-body text-ink-muted">
          Endpoints สำหรับผู้ดูแลระบบ (ต้องล็อกอินในระบบด้วย role ADMIN)
        </p>
        <div className="space-y-3">
          <div className="rounded-xl border border-border p-4 space-y-2">
            <EndpointBadge method="GET" path="/api/admin/webhooks" />
            <p className="text-body text-ink-muted">
              แสดงรายการ API Keys ทั้งหมด พร้อมข้อมูลโรงพยาบาล สถานะ และเวลาใช้งานล่าสุด
            </p>
          </div>
          <div className="rounded-xl border border-border p-4 space-y-2">
            <EndpointBadge method="POST" path="/api/admin/webhooks" />
            <p className="text-body text-ink-muted">
              สร้าง API Key ใหม่ ส่ง{' '}
              <code className="bg-surface-muted px-1 rounded text-caption">hcode</code> และ{' '}
              <code className="bg-surface-muted px-1 rounded text-caption">label</code> ระบบจะคืน
              API Key เพียงครั้งเดียว
            </p>
            <CodeBlock title="request body">
              {`{ "hcode": "99901", "label": "Production Key" }`}
            </CodeBlock>
          </div>
          <div className="rounded-xl border border-border p-4 space-y-2">
            <EndpointBadge method="DELETE" path="/api/admin/webhooks/:keyId" />
            <p className="text-body text-ink-muted">
              เพิกถอน API Key ทันที Key ที่ถูกเพิกถอนจะใช้งานไม่ได้อีก
            </p>
          </div>
        </div>
      </div>

      {/* cURL Example */}
      <div className="space-y-3">
        <h3 className="text-body-lg font-semibold text-ink">ตัวอย่างการเรียกใช้งาน (cURL)</h3>
        <CodeBlock title="terminal">
          {`curl -X POST https://nn-lrms.example.com/api/webhooks/patient-data \\
        -H "Content-Type: application/json" \\
        -H "Authorization: Bearer kklrms_a1b2c3d4e5f6..." \\
        -d '{
          "mode": "full_snapshot",
          "patients": [{
      "hn": "HN-001",
      "an": "AN-001",
      "name": "นาง ทดสอบ ระบบ",
      "age": 28,
      "admit_date": "2026-03-08T08:00:00+07:00",
      "gravida": 1,
      "ga_weeks": 41,
      "height_cm": 148,
      "us_weight_g": 4000
          }]
        }'`}
        </CodeBlock>
      </div>

      {/* Data Flow Note */}
      <div className="rounded-xl bg-brand-soft border border-brand-soft p-5 space-y-3">
        <h3 className="font-semibold text-brand flex items-center gap-2">
          <Activity size={18} />
          การประมวลผลหลังรับข้อมูล
        </h3>
        <ol className="text-body text-brand space-y-2 list-decimal list-inside">
          <li>เข้ารหัสชื่อ-สกุลและเลขบัตรประชาชน (AES-256-GCM ตาม PDPA)</li>
          <li>Upsert ข้อมูลผู้คลอดลงฐานข้อมูล (อิงจาก AN)</li>
          <li>ตรวจจับการย้ายโรงพยาบาลจาก CID Hash (ถ้ามี)</li>
          <li>คำนวณ CPD Risk Score อัตโนมัติจากปัจจัยที่ส่งมา</li>
          <li>แจ้งเตือนทันทีผ่าน SSE หากพบผู้คลอดเสี่ยงสูง</li>
          <li>อัปเดตสถานะโรงพยาบาลเป็น ONLINE บน Dashboard</li>
        </ol>
      </div>
    </div>
  );
}
