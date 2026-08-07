import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_EVENTS,
  findNotificationEvent,
  notificationEventKeys,
  implementedNotificationEvents,
} from '@/config/notification-events';

describe('notification event catalog', () => {
  it('has unique keys and Thai copy for every event', () => {
    expect(new Set(notificationEventKeys()).size).toBe(NOTIFICATION_EVENTS.length);
    for (const e of NOTIFICATION_EVENTS) {
      expect(e.labelTh.trim().length).toBeGreaterThan(2);
      expect(e.descriptionTh.trim().length).toBeGreaterThan(5);
      expect(['urgent', 'digest']).toContain(e.tier);
      expect(['patient', 'aggregate']).toContain(e.detail);
    }
  });

  it('marks only the two events that have producers today as implemented', () => {
    expect(
      implementedNotificationEvents()
        .map((e) => e.key)
        .sort(),
    ).toEqual(['anc_hr3', 'labor_emergency']);
  });

  it('resolves a known key and returns null for an unknown one', () => {
    expect(findNotificationEvent('anc_hr3')?.tier).toBe('urgent');
    expect(findNotificationEvent('nope')).toBeNull();
  });
});
