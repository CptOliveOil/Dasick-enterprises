import { describe, expect, it } from 'vitest';
import { deriveMissionState } from '@/lib/workflows/engine';
import type { Task, TaskStatus } from '@/types/domain';

function task(status: TaskStatus, id = Math.random().toString()): Task {
  return {
    id,
    owner_id: 'owner',
    mission_id: 'mission',
    business_id: null,
    agent_id: 'agent',
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
  };
}

describe('mission status derivation', () => {
  it('is planning when there is nothing to do', () => {
    expect(deriveMissionState([]).status).toBe('planning');
  });

  it('is running while any step is queued or running', () => {
    expect(deriveMissionState([task('queued'), task('waiting')]).status).toBe('running');
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
