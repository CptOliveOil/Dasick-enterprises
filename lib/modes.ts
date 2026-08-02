import { isDemoMode } from '@/lib/config';

/**
 * Which mode the workspace is running in.
 *
 * This is the whole of the difference between a demo and a real studio. There
 * is one workflow, one mission engine, one set of capabilities and one graph;
 * the mode decides only **which implementation answers each provider call**.
 *
 * That constraint is deliberate and worth stating plainly, because the
 * alternative is what most systems end up with: a "demo pipeline" that works
 * and a "real pipeline" that does not, diverging quietly until the demo is a
 * lie. Here a demo run and a production run execute the identical task graph,
 * in the identical order, with the identical approvals — and
 * `tests/modes.test.ts` asserts exactly that.
 *
 *   demo        every provider simulated; nothing billable; instant
 *   development real AI and real database; media providers may be simulated
 *   production  every provider real; everything billable and persisted
 *
 * Inference, not configuration, is the default: a workspace with no database is
 * a demo, and a workspace with a database is real. `COMMAND_CENTRE_MODE`
 * overrides that for the one case inference cannot see — a developer who wants
 * real Claude and a real database but does not want to pay for narration and
 * rendering on every test run.
 */

export const MODES = ['demo', 'development', 'production'] as const;
export type Mode = (typeof MODES)[number];

function envMode(): Mode | null {
  const raw = process.env.COMMAND_CENTRE_MODE?.trim().toLowerCase();
  return (MODES as readonly string[]).includes(raw ?? '') ? (raw as Mode) : null;
}

/**
 * The current mode.
 *
 * Read through this function rather than a captured constant: the answer gates
 * whether real money can be spent, and a value captured at import time is a
 * value that can be stale in exactly the situation where staleness costs.
 */
export function currentMode(): Mode {
  const declared = envMode();
  if (declared) {
    // One override is refused. Demo Mode means "no database", so a workspace
    // that has one cannot call itself a demo — that combination would put
    // simulated output into real records, which is the failure this whole
    // system is built to prevent.
    if (declared === 'demo' && !isDemoMode()) return 'development';
    return declared;
  }
  return isDemoMode() ? 'demo' : 'production';
}

/** True when simulated media providers may stand in for real ones. */
export function simulationAllowed(mode: Mode = currentMode()): boolean {
  if (process.env.DISABLE_SIMULATED_MEDIA === 'true') return false;
  return mode !== 'production';
}

/** True when work performed in this mode is billable and durable. */
export function isBillable(mode: Mode = currentMode()): boolean {
  return mode !== 'demo';
}

export interface ModeDescriptor {
  mode: Mode;
  label: string;
  summary: string;
  /** What the operator should expect to be charged for. */
  spending: string;
  /** Shown wherever output could be mistaken for real work. */
  warning: string | null;
}

const DESCRIPTORS: Record<Mode, Omit<ModeDescriptor, 'mode'>> = {
  demo: {
    label: 'Demo',
    summary:
      'Every provider is simulated. The workflow, the agents, the approvals and the artifacts are the real ones — only the things that would cost money are stand-ins.',
    spending: 'Nothing can be spent. No external call is made.',
    warning:
      'Everything produced here is placeholder output. It is clearly marked, it is never publishable, and it must not be presented as work.',
  },
  development: {
    label: 'Development',
    summary:
      'Real database, real Claude, real records. Media providers may be simulated so that a full pipeline can be exercised without paying for narration and rendering every time.',
    spending: 'Model calls are billable. Simulated media providers are not.',
    warning:
      'Any media in this workspace may be a placeholder. Check the provider on each asset before publishing anything.',
  },
  production: {
    label: 'Production',
    summary: 'Every provider is real. Everything is billable, persisted and publishable.',
    spending: 'Every step can spend, within the ceilings you set.',
    warning: null,
  },
};

export function describeMode(mode: Mode = currentMode()): ModeDescriptor {
  return { mode, ...DESCRIPTORS[mode] };
}
