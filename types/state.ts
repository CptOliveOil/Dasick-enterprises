import type {
  ActivityLog,
  Agent,
  AppNotification,
  Approval,
  Business,
  CommandMessage,
  Mission,
  Task,
} from './domain';

export interface WorkforceMetrics {
  agentsActive: number;
  agentsTotal: number;
  tasksRunning: number;
  awaitingApproval: number;
  completedToday: number;
  revenue: number;
  aiCosts: number;
  expenses: number;
  profit: number;
  currency: string;
}

/**
 * A handoff recent enough to still be animating between two planets. Derived
 * from activity logs so the galaxy never invents motion that did not happen.
 */
export interface LiveConnection {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  createdAt: string;
  message: string;
}

/** Everything the live interface needs, in one round trip. */
export interface WorkforceSnapshot {
  version: number;
  generatedAt: string;
  /** True when the app is running on the seeded in-memory demo dataset. */
  demo: boolean;
  /** True when a real AI provider is configured. */
  aiLive: boolean;
  businesses: Business[];
  agents: Agent[];
  missions: Mission[];
  tasks: Task[];
  approvals: Approval[];
  activity: ActivityLog[];
  notifications: AppNotification[];
  commandMessages: CommandMessage[];
  connections: LiveConnection[];
  metrics: WorkforceMetrics;
}
