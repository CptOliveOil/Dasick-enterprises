/**
 * What a capability needs before it can run.
 *
 * This is the fix for a real design bug: a system-level mission (Operational
 * Readiness, a daily briefing) was able to schedule a business-scoped
 * capability with no business attached, and the failure only surfaced deep
 * inside that capability's `persist()`, as `businessIdFor()` throwing
 * `MissingRelationship`. The validation there was — and stays — correct. The
 * bug was that nothing upstream of it *knew* a business was required before
 * committing to a plan, so there was no way to do the right thing (ask which
 * business, or fan out across every business) instead of the wrong one
 * (guess, or fail unrecognisably three layers down).
 *
 * Three scopes:
 *
 * - `system` — operates over the whole workspace. Never needs a business and
 *   must never be given one it didn't ask for.
 * - `business` — the default, and by far the most common: reads and writes
 *   business-scoped tables, and its `persist()` calls `businessIdFor()`.
 *   Unclassified capabilities default here deliberately — a capability that
 *   turns out to need a business and was never told about this file fails
 *   loudly at planning time, which is the safe direction to be wrong in.
 * - `mission` — only valid as one step inside a mission that already has the
 *   state it depends on (a prior script, a prior listing). Never a fresh,
 *   standalone task — nothing should ever schedule one of these as the first
 *   step of a new mission or as a readiness probe.
 */
export type CapabilityScope = 'system' | 'business' | 'mission';

/** Runs over the whole workspace. No business, ever. */
const SYSTEM_CAPABILITIES = new Set<string>([
  'manager.briefing',
  'manager.recommendations',
  'system.readiness.audit',
]);

/**
 * Confirmed to fail without a business — not by inspection of a comment, but
 * because their `persist()`/`run()` calls `businessIdFor()`
 * (`lib/agents/capabilities.ts`) or otherwise refuses outright
 * (`business.readiness.check`, `lib/agents/operations/index.ts`), and would
 * throw `MissingRelationship` (`lib/db/validate.ts`) the moment they ran.
 *
 * This is deliberately a hand-kept allowlist, not "everything defaults to
 * business": most of the codebase's capabilities — every production step
 * (`lib/agents/production/*.ts`), every Etsy artwork step, the Islamic and
 * Pokémon research handlers — resolve their business through mission-local
 * state (`resolveVideo`, `resolveProduct`, `ctx.business?.id ?? ctx.task.business_id ?? null`)
 * and tolerate it being absent. Marking those `business` too would make this
 * validation reject work that has never actually failed. Adding a capability
 * whose `persist()` calls `businessIdFor()` means adding it here too — that
 * is the one maintenance obligation this file creates.
 */
const BUSINESS_CAPABILITIES = new Set<string>([
  'youtube.research.ideas',
  'youtube.research.package',
  'youtube.script.write',
  'youtube.script.factcheck',
  'youtube.thumbnail.concepts',
  'youtube.analytics.analyse',
  'etsy.research.opportunities',
  'etsy.product.create',
  'etsy.listing.write',
  'seo.keywords',
  'business.readiness.check',
]);

/**
 * Everything else: genuinely business-agnostic (most Pokémon and Islamic
 * research), or dependent on state a prior step in the *same* mission already
 * produced (`youtube.script.revise`, every Etsy artwork step,
 * `etsy.package.zip`) rather than on `business_id` directly. Never a capability
 * to schedule as a mission's first, standalone step with nothing behind it.
 */
export function capabilityScope(capability: string): CapabilityScope {
  if (SYSTEM_CAPABILITIES.has(capability)) return 'system';
  if (BUSINESS_CAPABILITIES.has(capability)) return 'business';
  return 'mission';
}

/**
 * A plan tried to schedule a business capability with no business attached.
 *
 * Distinct from `MissingRelationship` (`lib/db/validate.ts`), which is the
 * same problem caught three layers later, inside a running task. This one
 * fires at planning time, before a single row is written, and names every
 * offending step rather than failing on whichever one happened to run first.
 */
export class ScopeViolation extends Error {
  constructor(
    readonly capabilities: string[],
    context: string,
  ) {
    super(
      `${context}: ${capabilities.join(', ')} ${capabilities.length === 1 ? 'requires' : 'require'} ` +
        'a business, but none was given. Name a business, or run this per business.',
    );
    this.name = 'ScopeViolation';
  }
}

/** Every step whose capability is `business`-scoped but has no business behind it. */
export function businessCapabilitiesWithoutBusiness(
  capabilities: string[],
  businessId: string | null,
): string[] {
  if (businessId) return [];
  return [...new Set(capabilities.filter((c) => capabilityScope(c) === 'business'))];
}
