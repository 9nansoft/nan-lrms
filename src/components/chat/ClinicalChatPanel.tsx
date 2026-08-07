'use client';

// Phase 3 — clinical-chat UI panel (Thai, cost-gated, informative UX).
// Renders a floating chat panel for clinicians. When the server reports the
// feature disabled (503) it collapses to a subtle hint instead of an error
// loop. Constitution V: every operation shows progress + actionable Thai
// errors; multi-turn weaves prior turns so the context stays coherent.
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  Bot,
  MessageSquareOff,
  RotateCcw,
  Square,
  Copy,
  Check,
  RefreshCw,
  BookOpen,
} from 'lucide-react';
import { ClinicalMarkdown } from '@/components/chat/ClinicalMarkdown';
import { useBmsSession } from '@/contexts/BmsSessionContext';
import type { ClinicalChatMode } from '@/services/chat/prompt-config';

interface ChatMessageUi {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  /** Tools that fed this answer — shown as provenance chips. */
  sources?: string[];
}

/** Thai labels for the tool names the API reports back as `sources`. Keeping
 *  this a lookup (not a switch) means a new tool shows its raw name rather
 *  than silently rendering nothing. */
const SOURCE_LABELS: Record<string, string> = {
  get_stage_kpis: 'สถิติรายระยะ',
  get_province_overview: 'ภาพรวมทั้งจังหวัด',
  get_trends: 'แนวโน้มย้อนหลัง',
  get_alerts: 'งานค้าง/แจ้งเตือน',
  get_current_datetime: 'วันเวลาปัจจุบัน',
  get_patient_context: 'ข้อมูลผู้ป่วย',
  ask_medical_ebook: 'ตำราแพทย์',
};

/** Mode-aware starter questions — an empty chat box gives no hint about what
 *  this assistant can actually answer. */
const STARTERS: Record<ClinicalChatMode, string[]> = {
  statistics: [
    'ตอนนี้มีคนรอคลอดกี่คน',
    'โรงพยาบาลไหนมีคนรอคลอดมากที่สุด',
    'มีอะไรต้องรีบจัดการบ้าง',
  ],
  clinical: ['ภาวะตกเลือดหลังคลอด รักษาอย่างไร', 'ผู้ป่วยเสี่ยงสูงในตอนนี้มีใครบ้าง'],
};

export function ClinicalChatPanel({ mode = 'clinical' }: { mode?: ClinicalChatMode }) {
  const [open, setOpen] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessageUi[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<string | null>(null);
  // The medical knowledge base authenticates with the user's BMS session id,
  // which only the browser holds — forward it so ask_medical_ebook can run.
  const { sessionId } = useBmsSession();

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // A textbook lookup takes ~20s. Silence for that long reads as "broken", so
  // count the seconds out loud (constitution V: every operation shows progress).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const ask = useCallback(
    async (text: string) => {
      if (!text || busy) return;
      setBusy(true);
      setElapsed(0);
      setMessages((m) => [...m, { role: 'user', content: text }]);
      lastQuestionRef.current = text;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, mode, bmsSessionId: sessionId }),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
          sources?: string[];
        };
        if (res.status === 503) {
          setDisabled(true);
        } else if (!res.ok || !body.answer) {
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              content: body.error ?? 'ยังตอบไม่ได้ ลองใหม่อีกครั้ง',
              error: true,
            },
          ]);
        } else {
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: body.answer as string, sources: body.sources },
          ]);
        }
      } catch (err) {
        // A user-pressed Stop is not an error — say so plainly.
        const stopped = err instanceof DOMException && err.name === 'AbortError';
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: stopped ? 'หยุดแล้ว' : 'ไม่สามารถติดต่อผู้ช่วยแชทได้',
            error: !stopped,
          },
        ]);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, mode, sessionId],
  );

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    void ask(text);
  }

  /** Stop the in-flight turn. Knowledge-base lookups can run ~20s, so waiting
   *  with no way out is the single worst state this panel can be in. */
  function stop() {
    abortRef.current?.abort();
  }

  /** New conversation. Clears the SERVER transcript too — it lives in Redis and
   *  would otherwise keep being replayed after the user "cleared" the chat. */
  async function resetChat() {
    stop();
    setMessages([]);
    lastQuestionRef.current = null;
    try {
      await fetch(`/api/chat?mode=${mode}`, { method: 'DELETE' });
    } catch {
      // Local view is already cleared; a failed server wipe is not worth an
      // error bubble, but the next turn would still carry old context.
      setMessages([
        {
          role: 'assistant',
          content: 'ล้างประวัติฝั่งเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง',
          error: true,
        },
      ]);
    }
  }

  async function copyMessage(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      setTimeout(() => setCopied((c) => (c === index ? null : c)), 1500);
    } catch {
      /* clipboard blocked — nothing actionable to tell the user */
    }
  }

  if (disabled) {
    return (
      <button
        onClick={() => setDisabled(false)}
        title="เปิดผู้ช่วยแชททางคลินิก"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-700 px-4 py-2 text-sm text-white shadow-lg"
      >
        <MessageSquareOff size={16} />
        AI ปิด
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex w-[22rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between rounded-t-2xl bg-teal-600 px-4 py-3 text-white">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
          aria-expanded={open}
        >
          <Bot size={18} />
          ผู้ช่วยแชททางคลินิก
        </button>
        <div className="flex items-center gap-1">
          {open && messages.length > 0 && (
            <button
              onClick={() => void resetChat()}
              title="เริ่มบทสนทนาใหม่ (ล้างประวัติทั้งฝั่งเครื่องและเซิร์ฟเวอร์)"
              aria-label="เริ่มบทสนทนาใหม่"
              className="rounded p-1.5 hover:bg-teal-700"
            >
              <RotateCcw size={15} />
            </button>
          )}
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-1 text-xs"
            aria-label={open ? 'ซ่อนหน้าต่างแชท' : 'ขยายหน้าต่างแชท'}
          >
            {open ? 'ซ่อน' : 'ขยาย'}
          </button>
        </div>
      </div>
      {open && (
        <>
          <div ref={listRef} className="h-72 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  {mode === 'statistics'
                    ? 'ถามสถิติผู้รอคลอด ANC การส่งต่อ หรือแนวโน้มของทั้งจังหวัดได้'
                    : 'ถามเรื่องผู้ป่วย ผู้ป่วยเสี่ยงสูง หรือแนวทางดูแลทางคลินิกได้'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS[mode].map((s) => (
                    <button
                      key={s}
                      onClick={() => void ask(s)}
                      className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] text-teal-800 hover:bg-teal-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-teal-100 text-teal-900'
                    : m.error
                      ? 'bg-rose-50 text-rose-800'
                      : 'bg-slate-100 text-slate-800'
                }`}
              >
                {m.role === 'user' || m.error ? (
                  m.content
                ) : (
                  <>
                    <ClinicalMarkdown>{m.content}</ClinicalMarkdown>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
                      {/* Provenance: which tools actually fed this answer. An
                          answer with no chip came from context or model memory. */}
                      {(m.sources ?? []).length > 0 &&
                        Array.from(new Set(m.sources)).map((s) => (
                          <span
                            key={s}
                            className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500"
                            title={`ข้อมูลจากเครื่องมือ: ${s}`}
                          >
                            <BookOpen size={10} />
                            {SOURCE_LABELS[s] ?? s}
                          </span>
                        ))}
                      <button
                        onClick={() => void copyMessage(i, m.content)}
                        className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
                        aria-label="คัดลอกคำตอบ"
                      >
                        {copied === i ? <Check size={11} /> : <Copy size={11} />}
                        {copied === i ? 'คัดลอกแล้ว' : 'คัดลอก'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {!busy && messages.some((m) => m.error) && lastQuestionRef.current && (
              <button
                onClick={() => void ask(lastQuestionRef.current as string)}
                className="flex items-center gap-1 text-xs text-teal-700 hover:underline"
              >
                <RefreshCw size={12} /> ลองถามใหม่อีกครั้ง
              </button>
            )}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500" aria-live="polite">
                <Loader2 size={14} className="animate-spin" />
                {elapsed >= 8 ? 'กำลังค้นข้อมูลอ้างอิง…' : 'กำลังคิด…'}
                <span className="tabular-nums">{elapsed}s</span>
                <button
                  onClick={stop}
                  className="ml-auto flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-100"
                  aria-label="หยุดการตอบ"
                >
                  <Square size={9} /> หยุด
                </button>
              </div>
            )}
          </div>
          <div className="flex items-end gap-2 border-t border-slate-100 p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="พิมพ์คำถามเป็นภาษาไทย…"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-lg bg-teal-600 p-2 text-white disabled:opacity-50"
              aria-label="ส่งคำถาม"
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
