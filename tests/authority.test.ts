import { describe, expect, it } from 'vitest';
import { ACTIONS, canPerform, describeAuthority } from '@/lib/agents/authority';
import type { AuthorityLevel } from '@/types/domain';

const LEVELS: AuthorityLevel[] = [0, 1, 2, 3, 4];

describe('authority model', () => {
  it('lets a read-only agent read and nothing else', () => {
    expect(canPerform(0, 'read').allowed).toBe(true);
    expect(canPerform(0, 'draft').allowed).toBe(false);
    expect(canPerform(0, 'write_internal').allowed).toBe(false);
  });

  it('lets a level 1 agent draft but not modify stored data', () => {
    expect(canPerform(1, 'draft').allowed).toBe(true);
    expect(canPerform(1, 'write_internal').allowed).toBe(false);
  });

  it('lets a level 2 agent modify internal data', () => {
    expect(canPerform(2, 'write_internal').allowed).toBe(true);
  });

  const gated = [
    'spend_money',
    'purchase',
    'publish_public',
    'send_external_message',
    'delete_important_data',
    'modify_account_settings',
  ] as const;

  it.each(gated)('never lets any level perform "%s" unattended', (action) => {
    for (const level of LEVELS) {
      const decision = canPerform(level, action);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.requiresApproval).toBe(true);
    }
  });

  it.each(gated)('allows "%s" only with an explicit authorisation at level 4', (action) => {
    expect(canPerform(4, action, [action]).allowed).toBe(true);
    // An authorisation for a different action must not carry over.
    const other = gated.find((a) => a !== action)!;
    expect(canPerform(4, action, [other]).allowed).toBe(false);
  });

  it('does not let a lower level use an explicit authorisation', () => {
    expect(canPerform(3, 'publish_public', ['publish_public']).allowed).toBe(false);
  });

  it('describes every level', () => {
    for (const level of LEVELS) {
      const info = describeAuthority(level);
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.detail.length).toBeGreaterThan(0);
    }
  });

  it('has a rule for every declared action', () => {
    for (const action of ACTIONS) {
      expect(() => canPerform(2, action)).not.toThrow();
    }
  });
});
