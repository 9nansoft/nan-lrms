// T041: ConnectionStatus — status dot + label + last sync timestamp
'use client';

import { COLOR } from '@/config/design-tokens';
import { CONNECTION_LABEL_TH } from '@/config/hospital-status';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';
import { cn } from '@/lib/utils';
import { formatThaiDate, formatThaiTime } from '@/lib/utils';

interface ConnectionStatusProps {
  status: ConnectionStatusEnum;
  lastSyncAt?: Date | string | null;
  className?: string;
}

const STATUS_CONFIG = {
  [ConnectionStatusEnum.ONLINE]: {
    color: COLOR.riskLow,
    label: CONNECTION_LABEL_TH[ConnectionStatusEnum.ONLINE],
    dotClass: 'bg-ok',
  },
  [ConnectionStatusEnum.OFFLINE]: {
    color: COLOR.riskHigh,
    label: CONNECTION_LABEL_TH[ConnectionStatusEnum.OFFLINE],
    dotClass: 'bg-danger',
  },
  [ConnectionStatusEnum.UNKNOWN]: {
    color: COLOR.inkSubtle,
    label: CONNECTION_LABEL_TH[ConnectionStatusEnum.UNKNOWN],
    dotClass: 'bg-gray-400',
  },
};

export function ConnectionStatus({ status, lastSyncAt, className }: ConnectionStatusProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span
        className={cn('inline-block h-2 w-2 rounded-full', config.dotClass)}
        aria-hidden="true"
      />
      <span style={{ color: config.color }}>{config.label}</span>
      {lastSyncAt && (
        <span className="text-xs text-muted-foreground">
          ({formatThaiDate(lastSyncAt)} {formatThaiTime(lastSyncAt)})
        </span>
      )}
    </span>
  );
}
