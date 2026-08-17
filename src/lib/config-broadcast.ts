// Cross-tab notification for system-config changes. The admin Active
// Province tab broadcasts after a successful save so a map that is already
// mounted (same browser, another tab — e.g. the dashboard or kiosk view)
// can flip to the new province immediately without a manual reload.
export const CONFIG_BROADCAST_CHANNEL = 'nn-lrms-config';

export interface ConfigBroadcastMessage {
  type: 'active-province-changed';
  code: string;
}
