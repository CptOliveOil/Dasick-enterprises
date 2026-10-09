import 'server-only';
import { after } from 'next/server';
import type { DataStore } from '@/lib/db/tables';
import { continueMission, type RunMissionResult } from './runner';

/**
 * Keeps a mission going after the response has been sent.
 *
 * A request runs at most a handful of steps so it can answer in time. Without
 * this, a mission that hit that ceiling sat idle — reading as unfinished, with
 * runnable work — until someone pressed Advance. There is no separate worker:
 * the work continues in this server process, and if the process dies part way
 * the next run reclaims the task it was on (`reclaimStaleTasks`).
 */
export function continueAfterResponse(
  store: DataStore,
  ownerId: string,
  run: Pick<RunMissionResult, 'missionId' | 'hasMore'> | null | undefined,
): void {
  if (!run?.hasMore) return;
  after(async () => {
    try {
      await continueMission(store, ownerId, run.missionId);
    } catch (error) {
      // The mission's own state records any task failure; this only catches
      // what escaped it, so it is never silently lost.
      console.error(`Background continuation of mission ${run.missionId} failed:`, error);
    }
  });
}
