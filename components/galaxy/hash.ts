/**
 * Deterministic pseudo-randomness for the galaxy.
 *
 * Every visual variation an agent gets — axial tilt, ring angle, which surface
 * pattern its planet wears — is derived from its id, so the same agent looks
 * the same on every load and on every machine. Nothing here is stored; it is
 * purely a way of turning an identifier into a stable appearance.
 */

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

export function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
