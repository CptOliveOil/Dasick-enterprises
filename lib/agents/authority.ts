import type { AuthorityLevel } from '@/types/domain';

/**
 * What an agent is allowed to do without a human in the loop.
 *
 * The rule the whole system rests on: an action an agent is not authorised for
 * does not fail silently and does not proceed — it raises an approval.
 */
export const AUTHORITY_DESCRIPTIONS: Record<AuthorityLevel, { name: string; detail: string }> = {
  0: {
    name: 'Read only',
    detail: 'May read application data. Cannot create, modify or produce anything.',
  },
  1: {
    name: 'Research and drafts',
    detail: 'May research and produce drafts. Nothing it creates takes effect on its own.',
  },
  2: {
    name: 'Modify internal data',
    detail: 'May update records inside Command Centre. No external effect.',
  },
  3: {
    name: 'External actions with approval',
    detail:
      'May prepare external actions — publishing, messaging, spending — but each one stops for approval.',
  },
  4: {
    name: 'Authorised automation',
    detail:
      'May carry out specific pre-authorised external actions without stopping. Grant deliberately.',
  },
};

export const ACTIONS = [
  'read',
  'draft',
  'write_internal',
  'spend_money',
  'purchase',
  'publish_public',
  'send_external_message',
  'delete_important_data',
  'modify_account_settings',
] as const;
export type AgentAction = (typeof ACTIONS)[number];

/** Minimum authority level required before an action can run unattended. */
const REQUIRED_LEVEL: Record<AgentAction, AuthorityLevel> = {
  read: 0,
  draft: 1,
  write_internal: 2,
  spend_money: 4,
  purchase: 4,
  publish_public: 4,
  send_external_message: 4,
  delete_important_data: 4,
  modify_account_settings: 4,
};

/**
 * Actions that always stop for approval regardless of level, unless the task
 * itself carries an explicit authorisation for that exact action.
 */
const ALWAYS_GATED: AgentAction[] = [
  'spend_money',
  'purchase',
  'publish_public',
  'send_external_message',
  'delete_important_data',
  'modify_account_settings',
];

export type AuthorityDecision =
  | { allowed: true }
  | { allowed: false; reason: string; requiresApproval: boolean };

export function canPerform(
  level: AuthorityLevel,
  action: AgentAction,
  explicitAuthorisations: AgentAction[] = [],
): AuthorityDecision {
  const required = REQUIRED_LEVEL[action];

  if (ALWAYS_GATED.includes(action)) {
    if (explicitAuthorisations.includes(action) && level >= 4) return { allowed: true };
    return {
      allowed: false,
      reason: `"${action}" requires explicit operator authorisation.`,
      requiresApproval: true,
    };
  }

  if (level < required) {
    return {
      allowed: false,
      reason: `Authority level ${level} is below the level ${required} this action requires.`,
      requiresApproval: level >= 1,
    };
  }
  return { allowed: true };
}

export function describeAuthority(level: AuthorityLevel) {
  return AUTHORITY_DESCRIPTIONS[level];
}
