import type { CapabilityHandler } from '@/lib/agents/capabilities';
import { islamicContentPlan, islamicResearch } from './research';
import { islamicScriptReview, islamicSourceVerify } from './verify';

/**
 * Islamic capabilities. Registered with the same registry as everything else
 * and executed by lib/agents/engine.ts — there is no separate path for them.
 */
export const ISLAMIC_HANDLERS: CapabilityHandler<never>[] = [
  islamicResearch,
  islamicContentPlan,
  islamicSourceVerify,
  islamicScriptReview,
] as unknown as CapabilityHandler<never>[];

export { islamicResearch, islamicContentPlan, islamicSourceVerify, islamicScriptReview };
