// src/db/tables/notification-event-subscriptions.ts
// Per-event opt-in, one row per (preference, event).
//
// A child table rather than a boolean column per event: adding an event then
// needs no DDL, and recipient resolution is a join instead of a
// dynamically-built `WHERE <column>` (injection surface + the "no hardcoded
// conditions" rule). Absence of children means ALL events — see the
// back-compatibility rule in the spec.
import type { TableDefinition } from '../table-definition';

export const notificationEventSubscriptionsTable: TableDefinition = {
  name: 'notification_event_subscriptions',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'preference_id', type: 'uuid' },
    { name: 'event_key', type: 'string', maxLength: 40 },
    { name: 'enabled', type: 'boolean', defaultValue: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'idx_nes_unique_pref_event',
      columns: ['preference_id', 'event_key'],
      unique: true,
    },
    { name: 'idx_nes_event_enabled', columns: ['event_key', 'enabled'] },
  ],
};
