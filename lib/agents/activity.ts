import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import type { ActivityKind, AppNotification, NotificationKind } from '@/types/domain';

export interface LogActivityInput {
  ownerId: string;
  businessId?: string | null;
  missionId?: string | null;
  taskId?: string | null;
  agentId?: string | null;
  /** Set on handoffs — this is what draws a beam between two planets. */
  targetAgentId?: string | null;
  kind: ActivityKind;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(store: DataStore, input: LogActivityInput) {
  return store.insert('activity_logs', {
    id: uuid(),
    owner_id: input.ownerId,
    business_id: input.businessId ?? null,
    mission_id: input.missionId ?? null,
    task_id: input.taskId ?? null,
    agent_id: input.agentId ?? null,
    target_agent_id: input.targetAgentId ?? null,
    kind: input.kind,
    message: input.message,
    metadata: input.metadata ?? {},
    is_demo: false,
    created_at: new Date().toISOString(),
  });
}

export async function notify(
  store: DataStore,
  input: {
    ownerId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    href?: string | null;
  },
): Promise<AppNotification> {
  return store.insert('notifications', {
    id: uuid(),
    owner_id: input.ownerId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    read: false,
    created_at: new Date().toISOString(),
  });
}
