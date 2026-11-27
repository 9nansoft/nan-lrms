'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type AdminKeyKind = 'webhook' | 'agent';

export interface CreatedKeyInfo {
  apiKey: string;
  keyPrefix: string;
  hospitalName?: string;
  hcode: string;
  label: string;
  kind: AdminKeyKind;
  agentConfig?: Record<string, unknown> | null;
}

export function isAgentScopedKey(scopes?: string[] | null): boolean {
  return Array.isArray(scopes) && scopes.some((s) => s.startsWith('agent:'));
}

export async function mintHospitalApiKey(params: {
  kind: AdminKeyKind;
  hcode: string;
  hospitalName?: string;
  label: string;
}): Promise<{ ok: true; data: CreatedKeyInfo } | { ok: false; error: string }> {
  const { kind, hcode, hospitalName, label } = params;
  if (kind === 'agent') {
    const res = await fetch(`/api/admin/hospitals/${encodeURIComponent(hcode)}/agent-key`, {
      method: 'POST',
    });
    const result = (await res.json().catch(() => ({}))) as {
      error?: string;
      hcode?: string;
      key?: string;
      keyPrefix?: string;
      label?: string;
      agentConfig?: Record<string, unknown>;
    };
    if (!res.ok || !result.key) {
      return { ok: false, error: result.error ?? 'สร้าง Agent Key ไม่สำเร็จ' };
    }
    return {
      ok: true,
      data: {
        apiKey: result.key,
        keyPrefix: result.keyPrefix ?? result.key.slice(0, 12),
        hospitalName,
        hcode: result.hcode ?? hcode,
        label: result.label ?? 'NN-LRMS agent',
        kind: 'agent',
        agentConfig: result.agentConfig ?? null,
      },
    };
  }

  const res = await fetch('/api/admin/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hcode, label: label.trim() }),
  });
  const result = (await res.json().catch(() => ({}))) as {
    error?: string;
    apiKey?: string;
    keyPrefix?: string;
    hospitalName?: string;
    hcode?: string;
    label?: string;
  };
  if (!res.ok || !result.apiKey) {
    return { ok: false, error: result.error ?? 'ไม่สามารถสร้างคีย์ได้' };
  }
  return {
    ok: true,
    data: {
      apiKey: result.apiKey,
      keyPrefix: result.keyPrefix ?? result.apiKey.slice(0, 12),
      hospitalName: result.hospitalName ?? hospitalName,
      hcode: result.hcode ?? hcode,
      label: result.label ?? label.trim(),
      kind: 'webhook',
      agentConfig: null,
    },
  };
}

export function CreatedKeyBanner({
  created,
  onClose,
}: {
  created: CreatedKeyInfo;
  onClose: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  const configText = created.agentConfig
    ? JSON.stringify(created.agentConfig, null, 2)
    : null;

  const copyText = async (text: string, onDone: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onDone(true);
      setTimeout(() => onDone(false), 2000);
    } catch {
      // clipboard blocked — leave the banner open so user can select manually
    }
  };

  const subtitle = created.hospitalName
    ? `${created.hospitalName} (${created.hcode}) · ${created.label}`
    : created.label;

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn-tint p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
          <div>
            <div className="text-body font-semibold text-warn-text">
              {created.kind === 'agent'
                ? 'บันทึก Agent Key นี้ไว้ทันที — ระบบจะไม่แสดงคีย์เต็มอีก'
                : 'บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงอีก'}
            </div>
            <div className="mt-0.5 text-label text-ink-muted">{subtitle}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink"
          title="ปิด"
          aria-label="ปิด"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2">
        <code className="flex-1 overflow-x-auto font-mono text-label text-ink">{created.apiKey}</code>
        <Button
          type="button"
          onClick={() => copyText(created.apiKey, setCopiedKey)}
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-label"
        >
          {copiedKey ? (
            <Check aria-hidden="true" className="h-4 w-4 text-ok-text" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
          {copiedKey ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </Button>
      </div>

      {created.kind === 'agent' && configText ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label font-medium text-ink">
              ตัวอย่างไฟล์ agent.config.json (นำ apiKey ไปแทนที่ในเครื่อง รพ. แล้วรีสตาร์ทบริการ)
            </span>
            <Button
              type="button"
              onClick={() => copyText(configText, setCopiedConfig)}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-caption"
            >
              {copiedConfig ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-ok-text" />
              ) : (
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {copiedConfig ? 'คัดลอก Config แล้ว' : 'คัดลอก agent.config.json'}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface-card p-3 font-mono text-caption text-ink">
            {configText}
          </pre>
        </div>
      ) : (
        <div className="mt-2 text-label text-ink-muted">
          ใช้ค่านี้ในส่วน{' '}
          <code className="rounded border border-border bg-surface-card px-1 font-mono text-caption">
            Authorization: Bearer &lt;key&gt;
          </code>{' '}
          (คีย์นี้ไม่มี scope สำหรับ nn-lrms-agent.exe — หากติดตั้ง Agent ให้เลือกประเภท Agent Key)
        </div>
      )}
    </div>
  );
}
