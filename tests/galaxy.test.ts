import { describe, expect, it } from 'vitest';
import { buildLayout, EMPTY_LAYOUT } from '@/components/galaxy/layout';
import {
  FLIGHT_SECONDS,
  hasExpired,
  inFlight,
  QUEUE_PATIENCE_MS,
  QUEUE_WINDOW_MS,
  readyToLaunch,
  STAGGER_SECONDS,
  worthFlying,
} from '@/components/galaxy/flights';
import { makeAgent } from './helpers';
import type { Agent } from '@/types/domain';

/**
 * The galaxy layout is presentation, but it is the part of the presentation
 * that can be wrong in ways nobody notices until the picture is ugly: planets
 * stacked on one another, an outer ring holding a single lonely agent, orbital
 * speeds fast enough to make the screen busy.
 *
 * These are the properties the scene depends on, tested away from WebGL.
 */

function fleet(count: number): Agent[] {
  return Array.from({ length: count }, (_, i) =>
    makeAgent({
      name: `Agent ${i}`,
      capabilities: ['test'],
      visual: {
        colour: '#34d399',
        atmosphere: '#6ee7b7',
        radius: 0.6 + (i % 4) * 0.12,
        orbit: 3.6 + i * 0.5,
        angle: i,
        speed: 0.04,
        inclination: (i % 5) * 0.05,
        roughness: 0.3 + (i % 3) * 0.2,
      },
    }),
  );
}

describe('galaxy layout', () => {
  it('has nothing to lay out when there are no agents', () => {
    expect(buildLayout([])).toBe(EMPTY_LAYOUT);
  });

  it('places every agent exactly once', () => {
    const agents = fleet(18);
    const layout = buildLayout(agents);
    expect(layout.planets.size).toBe(18);
    for (const agent of agents) expect(layout.planets.has(agent.id)).toBe(true);
  });

  it('spreads agents evenly across rings rather than leaving an outer straggler', () => {
    const layout = buildLayout(fleet(18));
    const perRing = new Map<number, number>();
    for (const planet of layout.planets.values()) {
      perRing.set(planet.orbit, (perRing.get(planet.orbit) ?? 0) + 1);
    }
    const counts = [...perRing.values()];
    expect(counts.length).toBe(layout.rings.length);
    // No ring may hold more than one planet more than the emptiest.
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('never opens more rings than the cap, however many agents there are', () => {
    expect(buildLayout(fleet(4)).rings.length).toBe(1);
    expect(buildLayout(fleet(60)).rings.length).toBeLessThanOrEqual(5);
  });

  it('keeps ring-mates apart and gives them one shared speed so they stay apart', () => {
    const layout = buildLayout(fleet(12));
    const byRing = new Map<number, { angle: number; speed: number }[]>();
    for (const planet of layout.planets.values()) {
      const list = byRing.get(planet.orbit) ?? [];
      list.push({ angle: planet.angle, speed: planet.speed });
      byRing.set(planet.orbit, list);
    }
    for (const list of byRing.values()) {
      expect(new Set(list.map((p) => p.speed)).size).toBe(1);
      const angles = list.map((p) => p.angle).sort((a, b) => a - b);
      for (let i = 1; i < angles.length; i += 1) {
        expect(angles[i] - angles[i - 1]).toBeGreaterThan(0.4);
      }
    }
  });

  it('draws planets larger than their stored radius, within bounds', () => {
    const agents = fleet(8);
    const layout = buildLayout(agents);
    for (const agent of agents) {
      const planet = layout.planets.get(agent.id)!;
      expect(planet.radius).toBeGreaterThan(agent.visual.radius);
      expect(planet.radius).toBeLessThanOrEqual(1.7);
    }
  });

  it('keeps every orbit slow enough to read as calm', () => {
    for (const planet of buildLayout(fleet(20)).planets.values()) {
      // Under 0.02 rad/s is a revolution measured in minutes, not seconds.
      expect(planet.speed).toBeLessThan(0.02);
      expect(planet.speed).toBeGreaterThan(0);
      expect(Math.abs(planet.spin)).toBeLessThan(0.05);
    }
  });

  it('turns outer rings more slowly than inner ones', () => {
    const layout = buildLayout(fleet(20));
    const speeds = new Map<number, number>();
    for (const planet of layout.planets.values()) speeds.set(planet.orbit, planet.speed);
    const rings = [...speeds.keys()].sort((a, b) => a - b);
    for (let i = 1; i < rings.length; i += 1) {
      expect(speeds.get(rings[i])!).toBeLessThan(speeds.get(rings[i - 1])!);
    }
  });

  it('frames to an extent that includes the outermost planet, not just its orbit', () => {
    const layout = buildLayout(fleet(18));
    const outer = Math.max(...layout.rings);
    expect(layout.systemRadius).toBeGreaterThan(outer);
  });

  it('gives the same agent the same appearance every time', () => {
    const agents = fleet(10);
    const first = buildLayout(agents);
    const second = buildLayout([...agents].reverse());
    for (const agent of agents) {
      expect(second.planets.get(agent.id)).toEqual(first.planets.get(agent.id));
    }
  });

  it('varies the surface pattern so planets are told apart before their colour is', () => {
    const styles = new Set(
      [...buildLayout(fleet(18)).planets.values()].map((planet) => planet.surface),
    );
    expect(styles.size).toBeGreaterThan(1);
  });
});

/**
 * Handoff craft only fly for real handoffs, and a burst of them must not turn
 * the screen into a swarm. Both are rules rather than rendering, so both are
 * tested here rather than being trusted to a screenshot.
 */
describe('handoff flights', () => {
  const now = Date.UTC(2026, 6, 30, 12, 0, 0);
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('flies a handoff logged moments ago', () => {
    expect(worthFlying(ago(2_000), now)).toBe(true);
  });

  it('refuses a handoff old enough to be history', () => {
    expect(worthFlying(ago(QUEUE_WINDOW_MS + 1), now)).toBe(false);
    expect(worthFlying(ago(30 * 60_000), now)).toBe(false);
  });

  it('tolerates a small clock skew rather than dropping the handoff', () => {
    expect(worthFlying(new Date(now + 3_000).toISOString(), now)).toBe(true);
  });

  it('refuses an unparseable timestamp instead of animating from NaN', () => {
    expect(worthFlying('not a date', now)).toBe(false);
  });

  it('holds a craft on the ground until a beat has passed since the last launch', () => {
    const base = { queued: 3, active: 1, maxConcurrent: 3, lastLaunchAt: 100 };
    expect(readyToLaunch({ ...base, now: 100.5 })).toBe(false);
    expect(readyToLaunch({ ...base, now: 100 + STAGGER_SECONDS })).toBe(true);
  });

  it('never exceeds the ceiling on craft in the air', () => {
    expect(
      readyToLaunch({ queued: 9, active: 3, maxConcurrent: 3, now: 500, lastLaunchAt: 0 }),
    ).toBe(false);
    expect(
      readyToLaunch({ queued: 9, active: 2, maxConcurrent: 3, now: 500, lastLaunchAt: 0 }),
    ).toBe(true);
  });

  it('launches nothing when nothing is queued', () => {
    expect(
      readyToLaunch({ queued: 0, active: 0, maxConcurrent: 3, now: 500, lastLaunchAt: 0 }),
    ).toBe(false);
  });

  it('staggers a burst of six handoffs instead of releasing them together', () => {
    let clock = 0;
    let active = 0;
    let queued = 6;
    let lastLaunchAt = Number.NEGATIVE_INFINITY;
    const launches: number[] = [];

    // Step a frame at a time for twelve seconds, retiring flights as they land.
    for (let frame = 0; frame < 720; frame += 1) {
      clock += 1 / 60;
      active = launches.filter((at) => inFlight(at, clock)).length;
      if (readyToLaunch({ queued, active, maxConcurrent: 3, now: clock, lastLaunchAt })) {
        launches.push(clock);
        lastLaunchAt = clock;
        queued -= 1;
      }
    }

    expect(launches.length).toBe(6);
    for (let i = 1; i < launches.length; i += 1) {
      expect(launches[i] - launches[i - 1]).toBeGreaterThanOrEqual(STAGGER_SECONDS - 0.02);
    }
    // At no point across the whole timeline were more than three in the air.
    for (let t = 0; t < 12; t += 0.1) {
      const airborne = launches.filter((at) => at <= t && inFlight(at, t)).length;
      expect(airborne).toBeLessThanOrEqual(3);
    }
  });

  it('drops a queued flight whose planets never appeared instead of wedging behind it', () => {
    expect(hasExpired(now - 1_000, now)).toBe(false);
    expect(hasExpired(now - (QUEUE_PATIENCE_MS + 1), now)).toBe(true);
  });

  it('keeps a craft in the air for its full crossing and no longer', () => {
    expect(inFlight(0, FLIGHT_SECONDS - 0.1)).toBe(true);
    expect(inFlight(0, FLIGHT_SECONDS)).toBe(false);
  });
});
