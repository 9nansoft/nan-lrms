// src/components/about/about-blocks.tsx
// Presentation blocks of the public /about page (moved out of page.tsx and
// put on the direction-C tokens). Static documentation facts — never KPIs.
import type { ReactNode } from 'react';
import { FileJson } from 'lucide-react';
import { RiskChip } from '@/components/shared/RiskChip';
import { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export function FactTile({
  value,
  label,
  testId,
}: {
  value: string;
  label: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="rounded-xl bg-brand-soft p-4 text-center">
      <div className="text-kpi-sm tabular-nums text-brand">{value}</div>
      <div className="mt-1 text-label text-brand">{label}</div>
    </div>
  );
}

export function StepItem({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">
        {step}
      </div>
      <div>
        <h3 className="text-body-lg text-ink">{title}</h3>
        <p className="mt-1 text-body text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-surface-card p-6 shadow-soft">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
        {icon}
      </div>
      <h3 className="mb-2 text-body-lg text-ink">{title}</h3>
      <p className="text-body text-ink-muted">{description}</p>
    </div>
  );
}

export function HospitalLevelRow({
  level,
  name,
  description,
}: {
  level: string;
  name: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border py-3 last:border-0">
      <span className="shrink-0 rounded-lg bg-brand-soft px-3 py-1 font-mono text-label font-bold text-brand">
        {level}
      </span>
      <div>
        <span className="text-body font-semibold text-ink">{name}</span>
        <p className="mt-0.5 text-label text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

const RISK_CARD: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'border-ok/40 bg-ok-tint',
  [RiskLevel.MEDIUM]: 'border-warn/40 bg-warn-tint',
  [RiskLevel.HIGH]: 'border-danger/40 bg-danger-tint',
};

export function RiskLevelCard({
  level,
  score,
  action,
}: {
  level: RiskLevel;
  score: string;
  action: string;
}) {
  return (
    <div className={cn('rounded-xl border p-4', RISK_CARD[level])}>
      <RiskChip level={level} />
      <p className="mt-2 text-body text-ink">
        คะแนน CPD: <span className="font-semibold tabular-nums">{score}</span>
      </p>
      <p className="text-label text-ink-muted">{action}</p>
    </div>
  );
}

export function CodeBlock({ title, children }: { title?: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {title && (
        <div className="flex items-center gap-2 bg-brand-strong px-4 py-2 font-mono text-caption text-brand-soft">
          <FileJson aria-hidden="true" className="h-4 w-4" />
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-ink p-4 font-mono text-label leading-relaxed text-surface-page">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const METHOD: Record<string, string> = {
  POST: 'border-ok/40 bg-ok-tint text-ok-text',
  GET: 'border-brand/30 bg-brand-soft text-brand',
  DELETE: 'border-danger/40 bg-danger-tint text-danger-text',
};

export function EndpointBadge({ method, path }: { method: string; path: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 font-mono text-label">
      <span className={cn('rounded border px-2 py-0.5 text-caption font-bold', METHOD[method])}>
        {method}
      </span>
      <span className="text-ink">{path}</span>
    </div>
  );
}
