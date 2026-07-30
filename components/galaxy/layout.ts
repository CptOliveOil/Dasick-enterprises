import type { Agent } from '@/types/domain';
import { hashString, mulberry32 } from './hash';

/**
 * Where a planet sits and how it moves, for display only.
 *
 * The stored `agent.visual` is the operator's choice — colour, relative size,
 * whether it has a ring. This module turns that choice into the geometry the
 * scene actually renders, and it exists because the two are different problems:
 * the operator picks an identity, the scene has to compose a solar system that
 * fills the screen and reads calmly however many agents there happen to be.
 *
 * Nothing here is written back. Change these numbers and only the picture
 * changes.
 */
export interface PlanetLayout {
  /** Distance from the command core. */
  orbit: number;
  /** Sphere radius in world units. */
  radius: number;
  /** Starting angle on the orbit, radians. */
  angle: number;
  /** Orbital angular velocity, radians per second. */
  speed: number;
  /** Vertical lift so orbits are not perfectly coplanar. */
  inclination: number;
  /** Axial rotation, radians per second. Signed — planets spin both ways. */
  spin: number;
  /** Axial tilt, radians. */
  tilt: number;
  /** Ring plane offset from the axis, radians. */
  ringTilt: number;
  ringed: boolean;
  /** Which procedural surface this planet wears. */
  surface: SurfaceStyle;
}

export type SurfaceStyle = 'banded' | 'mottled' | 'swirled';

export interface GalaxyLayout {
  planets: Map<string, PlanetLayout>;
  /** Orbit radii, inner to outer — the faint rings drawn under the planets. */
  rings: number[];
  /** Outermost extent including the planet on it. What the camera frames to. */
  systemRadius: number;
}

/** The first orbit. Close enough to the core that the middle is not a void. */
const INNER_ORBIT = 5.4;
/** Distance between orbits. Comfortably wider than the largest planet. */
const RING_GAP = 2.4;
/** Never more than this many orbits, however many agents there are. */
const MAX_RINGS = 5;
/** Planets are drawn larger than their stored radius so they read as worlds. */
const RADIUS_SCALE = 1.45;
const MIN_RADIUS = 0.62;
const MAX_RADIUS = 1.7;
/**
 * Orbital speed at the innermost ring, radians per second. A full revolution
 * takes just over six minutes — motion you notice only if you look for it.
 */
const INNER_SPEED = 0.0168;

export const EMPTY_LAYOUT: GalaxyLayout = {
  planets: new Map(),
  rings: [],
  systemRadius: INNER_ORBIT,
};

/**
 * Composes the whole system.
 *
 * Agents are sorted by their stored orbit so the operator's sense of who is
 * near the centre survives, then dealt evenly onto a small number of rings.
 * Even dealing is what stops the outer edge being a lonely single planet a long
 * way from everything else — the empty space the operator was looking at.
 *
 * Within a ring, planets are spaced at equal angles and every planet on that
 * ring shares one speed, so ring-mates hold their spacing forever and never
 * drift into each other.
 */
export function buildLayout(agents: Agent[]): GalaxyLayout {
  if (agents.length === 0) return EMPTY_LAYOUT;

  const ordered = [...agents].sort(
    (a, b) => a.visual.orbit - b.visual.orbit || a.id.localeCompare(b.id),
  );

  const ringCount = Math.max(1, Math.min(MAX_RINGS, Math.ceil(ordered.length / 4)));
  const buckets: Agent[][] = Array.from({ length: ringCount }, () => []);
  ordered.forEach((agent, index) => {
    buckets[Math.min(ringCount - 1, Math.floor((index * ringCount) / ordered.length))].push(agent);
  });

  const planets = new Map<string, PlanetLayout>();
  const rings: number[] = [];
  let systemRadius = INNER_ORBIT;

  buckets.forEach((bucket, ringIndex) => {
    if (bucket.length === 0) return;
    const orbit = Number((INNER_ORBIT + ringIndex * RING_GAP).toFixed(3));
    rings.push(orbit);

    // Outer rings turn more slowly, as they should, and every ring is offset
    // from the last so the system never lines up into spokes.
    const speed = Number((INNER_SPEED * (INNER_ORBIT / orbit)).toFixed(5));
    const ringPhase = ringIndex * 0.83;

    bucket.forEach((agent, index) => {
      const random = mulberry32(hashString(agent.id));
      const jitter = (random() - 0.5) * 0.22;
      const radius = Number(
        Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, agent.visual.radius * RADIUS_SCALE)).toFixed(3),
      );

      planets.set(agent.id, {
        orbit,
        radius,
        angle: Number(
          (ringPhase + (index / bucket.length) * Math.PI * 2 + jitter).toFixed(4),
        ),
        speed,
        // Halved from the stored value: shallow orbits keep the system reading
        // as one disc rather than a scattering of spheres.
        inclination: Number((agent.visual.inclination * 0.5).toFixed(3)),
        spin: Number(((random() < 0.5 ? -1 : 1) * (0.018 + random() * 0.022)).toFixed(4)),
        tilt: Number((0.06 + random() * 0.34).toFixed(3)),
        ringTilt: Number((random() * 0.5 - 0.25).toFixed(3)),
        ringed: agent.visual.ring === true,
        surface: surfaceStyleFor(agent),
      });

      systemRadius = Math.max(systemRadius, orbit + radius);
    });
  });

  return { planets, rings, systemRadius };
}

/**
 * Different agents should not look like the same planet in a different colour.
 *
 * The pattern is picked from the stored roughness first — a smooth choice reads
 * as a banded gas giant, a rough one as a mottled rocky world — and the id only
 * breaks the tie, so the operator's appearance setting still means something.
 */
function surfaceStyleFor(agent: Agent): SurfaceStyle {
  const { roughness } = agent.visual;
  if (roughness >= 0.6) return 'mottled';
  if (roughness <= 0.4) return 'banded';
  return hashString(agent.id) % 2 === 0 ? 'swirled' : 'banded';
}
