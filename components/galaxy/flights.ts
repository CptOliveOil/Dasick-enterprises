/**
 * When a handoff is worth flying, and when the next craft may leave.
 *
 * Pulled out of the component because these are the rules that keep a burst of
 * handoffs from turning into visual chaos, and rules are worth testing away
 * from a WebGL canvas.
 */

/** How long one craft takes to cross. Slow enough to follow with the eye. */
export const FLIGHT_SECONDS = 5.6;
/** Minimum gap between launches, so a burst reads as a convoy, not a swarm. */
export const STAGGER_SECONDS = 1.15;
/** A handoff older than this is history, not something to animate. */
export const QUEUE_WINDOW_MS = 60_000;
/** A queued flight whose planets never appeared is dropped rather than stuck. */
export const QUEUE_PATIENCE_MS = 25_000;
/** Nothing beyond this backlog is worth showing — it would all be stale. */
export const MAX_QUEUED = 12;

/**
 * True when a handoff is recent enough to animate.
 *
 * The galaxy shows what is happening, not what happened. A craft crossing the
 * screen for something logged half an hour ago would be a lie about the present,
 * so old handoffs are read in the activity stream and nowhere else.
 */
export function worthFlying(createdAt: string, now: number): boolean {
  const at = new Date(createdAt).getTime();
  if (Number.isNaN(at)) return false;
  const age = now - at;
  // A clock skew that puts the log slightly in the future is still current.
  return age <= QUEUE_WINDOW_MS && age >= -QUEUE_WINDOW_MS;
}

/** True when a queued flight has waited so long that it is no longer worth it. */
export function hasExpired(queuedAt: number, now: number): boolean {
  return now - queuedAt >= QUEUE_PATIENCE_MS;
}

/**
 * True when the next craft may leave.
 *
 * Two independent brakes: never more than `maxConcurrent` in the air at once,
 * and never two launches inside a beat of each other. Six handoffs landing in
 * the same second therefore leave as a spaced convoy rather than a swarm.
 */
export function readyToLaunch({
  queued,
  active,
  maxConcurrent,
  now,
  lastLaunchAt,
}: {
  queued: number;
  active: number;
  maxConcurrent: number;
  /** Scene clock time, seconds. */
  now: number;
  /** Scene clock time of the previous launch, or -Infinity if none. */
  lastLaunchAt: number;
}): boolean {
  if (queued <= 0) return false;
  if (active >= maxConcurrent) return false;
  return now - lastLaunchAt >= STAGGER_SECONDS;
}

/** True when a flight started at `startedAt` is still in the air. */
export function inFlight(startedAt: number, now: number): boolean {
  return now - startedAt < FLIGHT_SECONDS;
}
