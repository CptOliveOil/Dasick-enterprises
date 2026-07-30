'use client';

export interface QualityProfile {
  tier: 'high' | 'medium' | 'low';
  sphereSegments: [number, number];
  starCount: number;
  /** Handoff craft allowed in the air at once. The rest wait their turn. */
  maxRockets: number;
  /** Glow sprites trailing each craft. */
  rocketTrail: number;
  dpr: [number, number];
  orbitRings: boolean;
  atmospheres: boolean;
  /** Name-and-status labels under every planet. */
  labels: boolean;
}

const PROFILES: Record<QualityProfile['tier'], QualityProfile> = {
  high: {
    tier: 'high',
    // Planets are drawn considerably larger than they used to be, so the
    // silhouette has to hold up close to the camera.
    sphereSegments: [56, 36],
    starCount: 1200,
    maxRockets: 3,
    rocketTrail: 7,
    dpr: [1, 2],
    orbitRings: true,
    atmospheres: true,
    labels: true,
  },
  medium: {
    tier: 'medium',
    sphereSegments: [40, 26],
    starCount: 750,
    maxRockets: 2,
    rocketTrail: 5,
    dpr: [1, 1.5],
    orbitRings: true,
    atmospheres: true,
    labels: true,
  },
  low: {
    tier: 'low',
    sphereSegments: [28, 18],
    starCount: 450,
    maxRockets: 1,
    rocketTrail: 3,
    dpr: [1, 1],
    // Thin ring meshes cost almost nothing and they are what makes the scene
    // read as a solar system rather than scattered spheres.
    orbitRings: true,
    atmospheres: true,
    // A DOM label per planet is the one thing that genuinely costs on a weak
    // device, and the hover card carries the same information.
    labels: false,
  },
};

/**
 * Picks a rendering tier from what the device actually reports. The galaxy must
 * never be the reason the application is unusable, so anything that looks like
 * a phone or a low-core machine drops to the cheap profile.
 */
export function detectQuality(): QualityProfile {
  if (typeof window === 'undefined') return PROFILES.medium;

  const cores = navigator.hardwareConcurrency ?? 4;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 900;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;

  // Touch or a small viewport means a phone or tablet — always cheap. Core and
  // memory counts only demote a desktop when they are genuinely low; a 4-core
  // laptop still renders the full scene comfortably.
  if (coarsePointer || narrow) return PROFILES.low;
  if (cores <= 2 || memory <= 2) return PROFILES.low;
  if (cores <= 6 || memory <= 4 || window.devicePixelRatio > 2.5) return PROFILES.medium;
  return PROFILES.high;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
