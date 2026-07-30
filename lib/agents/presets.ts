import type { PlanetVisual } from '@/types/domain';

/**
 * Curated planet appearance.
 *
 * The galaxy is a designed system, not a colour picker: warm golds are
 * authority, greens and teals are research, violets are language work, oranges
 * are visual work, blues are production and measurement. Letting an operator
 * type a hex code would let one agent destroy that legibility, so the builder
 * offers presets and composes the rest.
 *
 * Orbit, angle and speed are *not* chosen by the operator — they are derived at
 * creation time so planets do not stack on top of each other.
 */

export interface ColourPreset {
  key: string;
  label: string;
  /** What this colour family means in the existing system. */
  meaning: string;
  colour: string;
  atmosphere: string;
}

export const COLOUR_PRESETS: ColourPreset[] = [
  {
    key: 'gold',
    label: 'Gold',
    meaning: 'Authority and orchestration',
    colour: '#f0b429',
    atmosphere: '#fde68a',
  },
  {
    key: 'emerald',
    label: 'Emerald',
    meaning: 'Research and verification',
    colour: '#10b981',
    atmosphere: '#a7f3d0',
  },
  {
    key: 'teal',
    label: 'Teal',
    meaning: 'Analysis and intelligence',
    colour: '#14b8a6',
    atmosphere: '#99f6e4',
  },
  {
    key: 'violet',
    label: 'Violet',
    meaning: 'Writing and language',
    colour: '#8b5cf6',
    atmosphere: '#ddd6fe',
  },
  {
    key: 'rose',
    label: 'Rose',
    meaning: 'Review and quality',
    colour: '#f43f5e',
    atmosphere: '#fecdd3',
  },
  {
    key: 'amber',
    label: 'Amber',
    meaning: 'Visual and creative direction',
    colour: '#f97316',
    atmosphere: '#fed7aa',
  },
  {
    key: 'azure',
    label: 'Azure',
    meaning: 'Production and measurement',
    colour: '#3b82f6',
    atmosphere: '#bfdbfe',
  },
  {
    key: 'jade',
    label: 'Deep jade',
    meaning: 'Sourced and scholarly work',
    colour: '#0f766e',
    atmosphere: '#5eead4',
  },
  {
    key: 'voltage',
    label: 'Voltage',
    meaning: 'Collectible and franchise research',
    colour: '#a3e635',
    atmosphere: '#d9f99d',
  },
];

export interface SizePreset {
  key: string;
  label: string;
  radius: number;
}

/** Three sizes only. A planet larger than the star would read as an error. */
export const SIZE_PRESETS: SizePreset[] = [
  { key: 'small', label: 'Small', radius: 0.45 },
  { key: 'medium', label: 'Medium', radius: 0.62 },
  { key: 'large', label: 'Large', radius: 0.8 },
];

export interface RingPreset {
  key: string;
  label: string;
  ring: boolean;
  roughness: number;
}

export const RING_PRESETS: RingPreset[] = [
  { key: 'none', label: 'No ring · smooth', ring: false, roughness: 0.35 },
  { key: 'textured', label: 'No ring · textured', ring: false, roughness: 0.65 },
  { key: 'ringed', label: 'Ringed', ring: true, roughness: 0.45 },
];

/**
 * Icons shown on lists and the inspector. Names are lucide icons that the UI
 * already bundles; an unknown name falls back to a plain dot rather than
 * throwing.
 */
export const SYMBOL_PRESETS = [
  'Sparkles',
  'Search',
  'BookOpen',
  'ScrollText',
  'ShieldCheck',
  'Scale',
  'PenLine',
  'Clapperboard',
  'Mic',
  'Image',
  'BarChart3',
  'Coins',
  'Compass',
  'Moon',
] as const;

export type SymbolPreset = (typeof SYMBOL_PRESETS)[number];

export const DEFAULT_COLOUR = 'emerald';
export const DEFAULT_SIZE = 'medium';
export const DEFAULT_RING = 'none';

export interface AppearanceChoice {
  colour: string;
  size: string;
  ring: string;
  symbol?: string;
}

/**
 * Composes a full `PlanetVisual` from preset keys plus an orbit slot.
 *
 * `slot` is the index of this planet among the account's agents. Orbit radius
 * and starting angle come from it via a golden-angle spiral, which spreads
 * planets evenly however many there are — the reason the operator never picks
 * an orbit by hand.
 */
export function composeVisual(choice: AppearanceChoice, slot: number): PlanetVisual {
  const colour =
    COLOUR_PRESETS.find((preset) => preset.key === choice.colour) ??
    COLOUR_PRESETS.find((preset) => preset.key === DEFAULT_COLOUR)!;
  const size =
    SIZE_PRESETS.find((preset) => preset.key === choice.size) ??
    SIZE_PRESETS.find((preset) => preset.key === DEFAULT_SIZE)!;
  const ring =
    RING_PRESETS.find((preset) => preset.key === choice.ring) ??
    RING_PRESETS.find((preset) => preset.key === DEFAULT_RING)!;

  // 2.399963 rad ≈ the golden angle: consecutive slots never line up.
  const angle = (slot * 2.399963) % (Math.PI * 2);
  const orbit = Number((4.2 + (slot % 9) * 0.92).toFixed(2));

  return {
    colour: colour.colour,
    atmosphere: colour.atmosphere,
    radius: size.radius,
    orbit,
    angle: Number(angle.toFixed(4)),
    // Outer planets orbit more slowly, as they should.
    speed: Number((0.045 - (orbit - 4.2) * 0.0028).toFixed(4)),
    inclination: Number((((slot % 5) - 2) * 0.055).toFixed(3)),
    ring: ring.ring,
    roughness: ring.roughness,
    ...(choice.symbol ? { symbol: choice.symbol } : {}),
  };
}

/** Reverses `composeVisual` well enough for the builder to show current choices. */
export function appearanceOf(visual: PlanetVisual): AppearanceChoice {
  const colour =
    COLOUR_PRESETS.find((preset) => preset.colour.toLowerCase() === visual.colour.toLowerCase())
      ?.key ?? DEFAULT_COLOUR;
  const size =
    SIZE_PRESETS.reduce((best, preset) =>
      Math.abs(preset.radius - visual.radius) < Math.abs(best.radius - visual.radius)
        ? preset
        : best,
    ).key ?? DEFAULT_SIZE;
  const ring = visual.ring ? 'ringed' : visual.roughness > 0.5 ? 'textured' : 'none';
  return { colour, size, ring, symbol: visual.symbol };
}
