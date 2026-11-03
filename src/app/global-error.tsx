// T098: Global error boundary for uncaught errors
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 p-8">
          <h2 className="text-xl font-bold text-danger-text">เกิดข้อผิดพลาดร้ายแรง</h2>
          <p className="text-gray-600">
            {error.message || 'ระบบเกิดข้อผิดพลาด กรุณาลองใหม่'}
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
