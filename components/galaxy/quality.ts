'use client';

export interface QualityProfile {
  tier: 'high' | 'medium' | 'low';
  sphereSegments: [number, number];
  starCount: number;
  /** Particles drawn along each active handoff beam. */
  beamParticles: number;
  dpr: [number, number];
  orbitRings: boolean;
  atmospheres: boolean;
}

const PROFILES: Record<QualityProfile['tier'], QualityProfile> = {
  high: {
    tier: 'high',
    sphereSegments: [48, 32],
    starCount: 1400,
    beamParticles: 14,
    dpr: [1, 2],
    orbitRings: true,
    atmospheres: true,
  },
  medium: {
    tier: 'medium',
    sphereSegments: [32, 20],
    starCount: 800,
    beamParticles: 10,
    dpr: [1, 1.5],
    orbitRings: true,
    atmospheres: true,
  },
  low: {
    tier: 'low',
    sphereSegments: [20, 14],
    starCount: 350,
    beamParticles: 6,
    dpr: [1, 1],
    orbitRings: false,
    atmospheres: false,
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

  if (coarsePointer || narrow || cores <= 4 || memory <= 4) return PROFILES.low;
  if (cores <= 8 || window.devicePixelRatio > 2.5) return PROFILES.medium;
  return PROFILES.high;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
