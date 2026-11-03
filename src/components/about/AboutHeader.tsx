// src/components/about/AboutHeader.tsx
// about-header.webp is abstract decoration (rounded shapes + green crosses).
// It must never be captioned or described as Khon Kaen geography — see
// scripts/illustrations/README.md. Text sits beside it, never on it.
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/shared/BrandMark';
import { HERO_ILLUSTRATION_SRC, illustrationsEnabled } from '@/config/illustrations';
import { cn } from '@/lib/utils';

export function AboutHeader() {
  const art = illustrationsEnabled();
  return (
    <header
      data-testid="about-header"
      className="border-b border-border bg-surface-page md:grid md:grid-cols-2"
    >
      {art && (
        <div aria-hidden="true" className="relative h-36 md:h-auto md:min-h-80">
          <Image
            src={HERO_ILLUSTRATION_SRC.aboutHeader}
            alt=""
            fill
            priority
            sizes="(min-width: 864px) 50vw, 100vw"
            className="object-cover object-left"
          />
        </div>
      )}
      <div
        className={cn('px-6 py-10 md:px-10 md:py-14', !art && 'mx-auto max-w-5xl md:col-span-2')}
      >
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-label text-brand hover:text-brand-strong"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          กลับหน้าเข้าสู่ระบบ
        </Link>
        <div className="mb-4 flex items-center gap-2.5">
          <BrandMark />
          <div>
            <p className="text-body-lg font-bold text-brand">NN-LRMS</p>
            <p className="text-caption text-ink-muted">Nan Labor Room Monitoring System</p>
          </div>
        </div>
        <h1 className="text-page text-brand">ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดน่าน</h1>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          ระบบ Real-time สำหรับสูติแพทย์และพยาบาลห้องคลอด ใช้ติดตามและประเมินความเสี่ยง
          ผู้คลอดในโรงพยาบาลชุมชนทั่วจังหวัดน่าน จากศูนย์กลางที่ รพ.น่าน
        </p>
      </div>
    </header>
  );
}
