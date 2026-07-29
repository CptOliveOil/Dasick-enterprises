import 'server-only';
import { uuid } from '@/lib/ids';
import type { DataStore } from '@/lib/db/tables';
import { logActivity } from '@/lib/agents/activity';
import type { JobKind, JobStatus, ProviderJob } from '@/types/production';

export interface EnqueueInput {
  ownerId: string;
  businessId: string | null;
  missionId?: string | null;
  videoId?: string | null;
  sceneId?: string | null;
  taskId?: string | null;
  kind: JobKind;
  provider: string;
  input: Record<string, unknown>;
  estimatedCost?: number;
}

export interface JobContext {
  job: ProviderJob;
  /** Reports progress on the job row, so a long operation is observable. */
  progress(percent: number, note?: string): Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<{
  output: Record<string, unknown>;
  actualCost?: number;
}>;

/**
 * Long-running work — speech synthesis, image and video generation, rendering.
 *
 * The interface is deliberately vendor-neutral: an Inngest, Trigger.dev, BullMQ
 * or Supabase-queue driver implements the same three methods. Domain code only
 * ever sees `run`, `get` and `cancel`.
 */
export interface JobQueue {
  readonly driver: string;
  /** Records the job, executes it, and returns the finished row. */
  run(input: EnqueueInput, handler: JobHandler): Promise<ProviderJob>;
  get(jobId: string): Promise<ProviderJob | null>;
  cancel(jobId: string): Promise<void>;
}

/**
 * In-process driver.
 *
 * Every job is persisted before it starts and updated as it goes, so progress
 * and failures survive the request that began them and are visible in the
 * activity feed. Swapping in a distributed queue later means implementing
 * `JobQueue` — no domain code changes.
 */
export class InProcessJobQueue implements JobQueue {
  readonly driver = 'in-process';
  private cancelled = new Set<string>();

  constructor(private store: DataStore) {}

  async run(input: EnqueueInput, handler: JobHandler): Promise<ProviderJob> {
    const timestamp = new Date().toISOString();
    const job: ProviderJob = {
      id: uuid(),
      owner_id: input.ownerId,
      business_id: input.businessId,
      mission_id: input.missionId ?? null,
      video_id: input.videoId ?? null,
      scene_id: input.sceneId ?? null,
      task_id: input.taskId ?? null,
      kind: input.kind,
      provider: input.provider,
      external_id: null,
      status: 'queued',
      progress: 0,
      input: input.input,
      output: null,
      error: null,
      estimated_cost: input.estimatedCost ?? 0,
      actual_cost: null,
      attempts: 0,
      created_at: timestamp,
      started_at: null,
      completed_at: null,
      updated_at: timestamp,
    };
    await this.store.insert('provider_jobs', job);

    await this.transition(job.id, 'processing', {
      started_at: new Date().toISOString(),
      attempts: 1,
    });
    await logActivity(this.store, {
      ownerId: input.ownerId,
      businessId: input.businessId,
      missionId: input.missionId ?? null,
      taskId: input.taskId ?? null,
      kind: 'job_started',
      message: `${labelFor(input.kind)} started (${input.provider})`,
      metadata: { job_id: job.id, kind: input.kind },
    });

    const context: JobContext = {
      job,
      progress: async (percent, note) => {
        if (this.cancelled.has(job.id)) return;
        await this.store.update('provider_jobs', job.id, {
          progress: Math.max(0, Math.min(100, Math.round(percent))),
          updated_at: new Date().toISOString(),
        });
        // Only milestone progress reaches the feed, so it stays readable.
        if (note || percent >= 100 || percent % 25 === 0) {
          await logActivity(this.store, {
            ownerId: input.ownerId,
            businessId: input.businessId,
            missionId: input.missionId ?? null,
            taskId: input.taskId ?? null,
            kind: 'job_progress',
            message: note ?? `${labelFor(input.kind)} ${Math.round(percent)}%`,
            metadata: { job_id: job.id },
          });
        }
      },
    };

    try {
      const result = await handler(context);
      if (this.cancelled.has(job.id)) {
        await this.transition(job.id, 'cancelled', { completed_at: new Date().toISOString() });
        return (await this.get(job.id))!;
      }
      await this.transition(job.id, 'completed', {
        progress: 100,
        output: result.output,
        actual_cost: result.actualCost ?? input.estimatedCost ?? 0,
        completed_at: new Date().toISOString(),
      });
      await logActivity(this.store, {
        ownerId: input.ownerId,
        businessId: input.businessId,
        missionId: input.missionId ?? null,
        taskId: input.taskId ?? null,
        kind: 'job_completed',
        message: `${labelFor(input.kind)} complete`,
        metadata: { job_id: job.id },
      });
      return (await this.get(job.id))!;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown job failure';
      await this.transition(job.id, 'failed', {
        error: message,
        completed_at: new Date().toISOString(),
      });
      await logActivity(this.store, {
        ownerId: input.ownerId,
        businessId: input.businessId,
        missionId: input.missionId ?? null,
        taskId: input.taskId ?? null,
        kind: 'job_failed',
        message: `${labelFor(input.kind)} failed — ${message}`,
        metadata: { job_id: job.id },
      });
      throw error;
    }
  }

  async get(jobId: string): Promise<ProviderJob | null> {
    return this.store.get('provider_jobs', jobId);
  }

  async cancel(jobId: string): Promise<void> {
    this.cancelled.add(jobId);
    await this.transition(jobId, 'cancelled', { completed_at: new Date().toISOString() });
  }

  private async transition(
    jobId: string,
    status: JobStatus,
    patch: Partial<ProviderJob> = {},
  ): Promise<void> {
    await this.store.update('provider_jobs', jobId, {
      status,
      updated_at: new Date().toISOString(),
      ...patch,
    });
  }
}

const LABELS: Record<JobKind, string> = {
  voiceover: 'Voiceover generation',
  image: 'Image generation',
  video_clip: 'Video generation',
  stock_fetch: 'Stock media fetch',
  render: 'Video render',
  thumbnail: 'Thumbnail generation',
};

function labelFor(kind: JobKind): string {
  return LABELS[kind] ?? 'Job';
}

export function getJobQueue(store: DataStore): JobQueue {
  return new InProcessJobQueue(store);
}
