// T042: LoadingState — spinner with optional Thai message, skeleton variant
'use client';

import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  variant?: 'spinner' | 'skeleton';
  className?: string;
}

export function LoadingState({
  message = 'กำลังโหลดข้อมูล...',
  variant = 'spinner',
  className,
}: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={cn('space-y-3 animate-pulse', className)}>
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="h-4 bg-muted rounded w-5/6" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-8', className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      {message && <p className="text-body text-muted-foreground">{message}</p>}
    </div>
  );
}
