import { describe, expect, it } from 'vitest';
import { deriveMissionState } from '@/lib/workflows/engine';
import { describeTaskLifecycle } from '@/lib/agents/status';
import type { Task, TaskStatus } from '@/types/domain';

function task(status: TaskStatus, id = Math.random().toString()): Task {
  return {
    id,
    owner_id: 'owner',
    mission_id: '6c654deb-fa4c-4f1d-8499-5df5feb61889',
    business_id: null,
    agent_id: 'b33aed8f-3134-4967-83dc-39f9a7c95783',
    step_key: null,
    title: 'task',
    description: '',
    status,
    priority: 'normal',
    input: {},
    output: null,
    error: null,
    progress: 0,
    is_demo: false,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    due_at: null,
    claimed_at: null,
    heartbeat_at: null,
    reclaim_count: 0,
  };
}

describe('mission status derivation', () => {
  it('is planning when there is nothing to do', () => {
    expect(deriveMissionState([]).status).toBe('planning');
  });

  it('is running only once a step has actually started, not merely queued', () => {
    // A mission with nothing but queued and waiting steps has never executed
    // a single task — it reads as `planning` (grouped with `running` by every
    // caller that treats a mission as "in progress"), not `running`, which
    // used to be indistinguishable from genuine progress. See
    // "A Missing Agent Left A Readiness Task Queued Forever" in the vault.
    expect(deriveMissionState([task('queued'), task('waiting')]).status).toBe('planning');
    expect(deriveMissionState([task('running'), task('waiting')]).status).toBe('running');
  });

  it('reports needs_approval as soon as one step is gated', () => {
    expect(deriveMissionState([task('approval'), task('waiting')]).status).toBe('needs_approval');
  });

  it('prioritises failure over an outstanding approval', () => {
    expect(deriveMissionState([task('failed'), task('approval')]).status).toBe('failed');
  });

  it('completes only when every step has finished', () => {
    expect(deriveMissionState([task('completed'), task('completed')]).status).toBe('completed');
    expect(deriveMissionState([task('completed'), task('running')]).status).toBe('running');
  });

  it('treats an all-cancelled mission as cancelled, not completed', () => {
    expect(deriveMissionState([task('cancelled'), task('cancelled')]).status).toBe('cancelled');
  });

  it('counts a completed step as full progress', () => {
    expect(deriveMissionState([task('completed'), task('completed')]).progress).toBe(100);
  });

  it('gives partial credit to running and gated steps', () => {
    const { progress } = deriveMissionState([task('completed'), task('running')]);
    expect(progress).toBeGreaterThan(50);
    expect(progress).toBeLessThan(100);
  });

  it('keeps progress inside 0–100', () => {
    const many = Array.from({ length: 9 }, () => task('approval'));
    const { progress } = deriveMissionState(many);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });

  it('reports waiting when everything is blocked on a dependency', () => {
    expect(deriveMissionState([task('waiting'), task('waiting')]).status).toBe('waiting');
  });
});

describe('task lifecycle description', () => {
  it('says a queued task was never picked up, with no claim to point to', () => {
    const t = task('queued');
    expect(describeTaskLifecycle(t)).toMatch(/never picked up yet/);
  });

  it('names a recovered task by how many times it was reclaimed', () => {
    const t = { ...task('queued'), reclaim_count: 2 };
    expect(describeTaskLifecycle(t)).toMatch(/recovered from a stale run 2 times/);
  });

  it('flags a running task with no recent heartbeat as likely stale', () => {
    const t = {
      ...task('running'),
      claimed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    };
    expect(describeTaskLifecycle(t)).toMatch(/likely stale/);
  });

  it('reads a genuinely active running task as in progress, not stale', () => {
    const t = {
      ...task('running'),
      claimed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    };
    expect(describeTaskLifecycle(t)).toMatch(/in progress/);
    expect(describeTaskLifecycle(t)).not.toMatch(/stale/);
  });

  it('reports how long a completed task actually took', () => {
    const started = new Date(Date.now() - 30_000).toISOString();
    const t = { ...task('completed'), started_at: started, completed_at: new Date().toISOString() };
    expect(describeTaskLifecycle(t)).toMatch(/completed .* \(took 30s\)/);
  });

  it('reports a failure the same way, not as a silent completion', () => {
    const started = new Date(Date.now() - 10_000).toISOString();
    const t = { ...task('failed'), started_at: started, completed_at: new Date().toISOString() };
    expect(describeTaskLifecycle(t)).toMatch(/failed/);
  });
});
