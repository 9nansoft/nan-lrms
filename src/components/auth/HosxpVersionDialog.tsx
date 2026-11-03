import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface VersionRejection {
  hospitalCode: string;
  hospitalName: string;
  currentVersion: string | null;
  minVersion: string;
  message: string;
}

export function HosxpVersionDialog({ rejection, onClose }: { rejection: VersionRejection | null; onClose: () => void }) {
  return (
      <Dialog
        open={rejection !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden" showCloseButton={false}>
          <div className="bg-danger-tint px-6 pt-6 pb-5 border-b border-danger/40">
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-full bg-danger-tint p-2.5 ring-4 ring-danger/40">
                <AlertTriangle className="h-6 w-6 text-danger-text" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold text-danger-text">
                    ต้องอัปเดต HOSxP ก่อนใช้งาน
                  </DialogTitle>
                  <DialogDescription className="text-label text-danger-text mt-1">
                    เวอร์ชัน HOSxP API ของโรงพยาบาลเก่ากว่าที่ระบบ NN-LRMS รองรับ
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          {rejection && (
            <div className="px-6 py-5 space-y-4">
              {(rejection.hospitalName || rejection.hospitalCode) && (
                <div className="rounded-lg border border-border bg-surface-muted px-3 py-2.5">
                  <div className="text-label font-semibold text-ink-muted">
                    โรงพยาบาล
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-ink truncate">
                    {rejection.hospitalName || '—'}
                  </div>
                  {rejection.hospitalCode && (
                    <div className="mt-0.5 font-mono text-caption text-ink-muted">
                      รหัส {rejection.hospitalCode}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2.5">
                  <div className="text-label font-semibold text-danger-text">
                    เวอร์ชันปัจจุบัน
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-danger-text">
                    {rejection.currentVersion ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-ok/40 bg-ok-tint px-3 py-2.5">
                  <div className="text-label font-semibold text-ok-text">
                    ต้องการอย่างน้อย
                  </div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-ok-text">
                    {rejection.minVersion}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-warn/40 bg-warn-tint px-3 py-2.5 text-label leading-relaxed text-warn-text">
                กรุณาติดต่อผู้ดูแลระบบ HOSxP ของโรงพยาบาลเพื่ออัปเดต HOSxP เป็นเวอร์ชัน{' '}
                <span className="font-mono font-semibold">{rejection.minVersion}</span>{' '}
                ขึ้นไป จากนั้นจึงเข้าใช้งาน NN-LRMS อีกครั้ง
              </div>
            </div>
          )}

          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => onClose()}
            >
              ปิด
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-brand hover:bg-brand-strong text-white"
              onClick={() => onClose()}
            >
              รับทราบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
