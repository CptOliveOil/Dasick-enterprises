import type {
  ActivityLog,
  Agent,
  AgentMemory,
  ApiUsage,
  AppNotification,
  Approval,
  Business,
  ChannelIntelligence,
  CommandMessage,
  EtsyAnalytics,
  EtsyKeyword,
  EtsyListing,
  EtsyOpportunity,
  EtsyProduct,
  EtsyStore,
  FinancialTransaction,
  IntegrationConnection,
  Mission,
  Profile,
  Task,
  TaskDependency,
  ThumbnailConcept,
  WorkflowDefinition,
  WorkflowRun,
  YoutubeAnalytics,
  YoutubeChannel,
  YoutubeFactCheck,
  YoutubeIdea,
  YoutubeResearch,
  YoutubeScene,
  YoutubeScript,
  YoutubeScriptVersion,
  YoutubeVideo,
} from '@/types/domain';

/**
 * The single source of truth for which tables exist and what shape their rows
 * are. Both the in-memory driver and the Supabase driver are typed against it,
 * so a table cannot exist in one and not the other.
 */
export interface Tables {
  profiles: Profile;
  businesses: Business;
  agents: Agent;
  agent_memory: AgentMemory;
  missions: Mission;
  tasks: Task;
  task_dependencies: TaskDependency;
  workflow_definitions: WorkflowDefinition;
  workflow_runs: WorkflowRun;
  approvals: Approval;
  activity_logs: ActivityLog;
  notifications: AppNotification;
  command_messages: CommandMessage;
  youtube_channels: YoutubeChannel;
  youtube_ideas: YoutubeIdea;
  youtube_research: YoutubeResearch;
  youtube_scripts: YoutubeScript;
  youtube_script_versions: YoutubeScriptVersion;
  youtube_fact_checks: YoutubeFactCheck;
  youtube_videos: YoutubeVideo;
  youtube_scenes: YoutubeScene;
  youtube_thumbnail_concepts: ThumbnailConcept;
  youtube_analytics: YoutubeAnalytics;
  youtube_channel_intelligence: ChannelIntelligence;
  etsy_stores: EtsyStore;
  etsy_opportunities: EtsyOpportunity;
  etsy_products: EtsyProduct;
  etsy_listings: EtsyListing;
  etsy_keywords: EtsyKeyword;
  etsy_analytics: EtsyAnalytics;
  financial_transactions: FinancialTransaction;
  api_usage: ApiUsage;
  integration_connections: IntegrationConnection;
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T];

export const TABLE_NAMES: TableName[] = [
  'profiles',
  'businesses',
  'agents',
  'agent_memory',
  'missions',
  'tasks',
  'task_dependencies',
  'workflow_definitions',
  'workflow_runs',
  'approvals',
  'activity_logs',
  'notifications',
  'command_messages',
  'youtube_channels',
  'youtube_ideas',
  'youtube_research',
  'youtube_scripts',
  'youtube_script_versions',
  'youtube_fact_checks',
  'youtube_videos',
  'youtube_scenes',
  'youtube_thumbnail_concepts',
  'youtube_analytics',
  'youtube_channel_intelligence',
  'etsy_stores',
  'etsy_opportunities',
  'etsy_products',
  'etsy_listings',
  'etsy_keywords',
  'etsy_analytics',
  'financial_transactions',
  'api_usage',
  'integration_connections',
];

/** Every row in every table has these. */
export interface BaseRow {
  id: string;
}

export type Filter<T> = Partial<{ [K in keyof T]: T[K] | T[K][] }>;

export interface QueryOptions<T> {
  where?: Filter<T>;
  orderBy?: { column: keyof T & string; ascending?: boolean };
  limit?: number;
}

/**
 * Storage driver contract. Deliberately small: the application never issues
 * raw SQL, so swapping Postgres for the in-memory demo store is total.
 */
export interface DataStore {
  readonly driver: 'memory' | 'supabase';
  list<T extends TableName>(
    table: T,
    options?: QueryOptions<Row<T>>,
  ): Promise<Row<T>[]>;
  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  insert<T extends TableName>(table: T, row: Row<T>): Promise<Row<T>>;
  insertMany<T extends TableName>(table: T, rows: Row<T>[]): Promise<Row<T>[]>;
  update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<Row<T>>,
  ): Promise<Row<T>>;
  remove<T extends TableName>(table: T, id: string): Promise<void>;
  /** Monotonic counter bumped on every mutation — drives live updates. */
  version(): Promise<number>;
}
