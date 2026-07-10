'use client';

// Directory of online users grouped by hospital — pick a person to call.
// Data comes from /api/calls/directory (Redis presence, requester excluded).
import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, RefreshCw, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface DirectoryCallTarget {
  userId: string;
  name: string;
  role: string;
  hospitalName: string;
}

interface DirectoryHospital {
  hospitalCode: string;
  hospitalName: string;
  users: { userId: string; name: string; role: string }[];
}

interface CallDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCall: (target: DirectoryCallTarget) => void;
}

export function CallDirectoryDialog({ open, onOpenChange, onCall }: CallDirectoryDialogProps) {
  const [hospitals, setHospitals] = useState<DirectoryHospital[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/calls/directory');
      if (!res.ok) throw new Error(`directory ${res.status}`);
      const body = (await res.json()) as { hospitals: DirectoryHospital[] };
      setHospitals(body.hospitals);
    } catch {
      setHospitals(null);
      setError('ไม่สามารถโหลดรายชื่อผู้ใช้ออนไลน์ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <Video className="h-4 w-4 text-emerald-600" /> โทรวิดีโอระหว่างโรงพยาบาล
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-[12px] text-slate-500">
          <span>แสดงเฉพาะผู้ใช้ที่ออนไลน์อยู่ขณะนี้</span>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="รีเฟรชรายชื่อ"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> รีเฟรช
          </button>
        </div>

        {loading && !hospitals && (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดรายชื่อ…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
            {error}
            <button
              onClick={() => void load()}
              className="mt-2 block cursor-pointer rounded-md border border-red-300 px-3 py-1 text-[12px] font-semibold text-red-700 hover:bg-red-100"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {hospitals && hospitals.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-500">
            ไม่มีผู้ใช้ท่านอื่นออนไลน์ในขณะนี้ — ลองรีเฟรชอีกครั้งภายหลัง
          </div>
        )}

        {hospitals?.map((hospital) => (
          <div key={hospital.hospitalCode} className="rounded-md border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-700">
              <Building2 className="h-4 w-4 text-slate-400" />
              {hospital.hospitalName}
              <span className="ml-auto text-[11px] font-normal text-slate-400">
                {hospital.users.length} คนออนไลน์
              </span>
            </div>
            <ul>
              {hospital.users.map((user) => (
                <li
                  key={user.userId}
                  className="flex items-center gap-2 px-3 py-2 not-last:border-b not-last:border-slate-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-slate-900">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-slate-500">{user.role}</div>
                  </div>
                  <button
                    onClick={() =>
                      onCall({
                        userId: user.userId,
                        name: user.name,
                        role: user.role,
                        hospitalName: hospital.hospitalName,
                      })
                    }
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <Video className="h-3.5 w-3.5" /> โทร
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
