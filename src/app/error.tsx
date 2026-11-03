// T098: Global error boundary
'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[400px] items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold text-danger-text">เกิดข้อผิดพลาด</h2>
        <p className="text-muted-foreground">
          {error.message || 'ระบบพบข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง'}
        </p>
        <Button onClick={reset} variant="outline">
          ลองใหม่
        </Button>
      </div>
    </div>
  );
}
