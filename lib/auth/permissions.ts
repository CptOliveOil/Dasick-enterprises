import { ACCOUNT_ROLES, type AccountRole } from '@/types/domain';

/**
 * What a signed-in person may do.
 *
 * Command Centre is single-owner today. The role table below exists so that
 * adding a team member later is a data change rather than an audit of every
 * route — and so that the checks written now are already the right shape.
 *
 * These are checked on the server, in `lib/auth/session.ts`. Hiding a button is
 * a courtesy to the operator, never a security boundary.
 */
export const PERMISSIONS = [
  'businesses.view',
  'agents.view',
  'agents.create',
  'agents.edit',
  'agents.disable',
  'missions.create',
  'tasks.approve',
  'integrations.manage',
  'finance.view',
  'budgets.manage',
  'content.publish',
  'settings.manage',
  'account.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = ['businesses.view', 'agents.view', 'finance.view'];

const MEMBER: Permission[] = [...VIEWER, 'missions.create'];

const ADMIN: Permission[] = [
  ...MEMBER,
  'agents.create',
  'agents.edit',
  'agents.disable',
  'tasks.approve',
  'integrations.manage',
  'budgets.manage',
  'settings.manage',
];

/**
 * The owner is the only role that may publish. Publishing is the one action
 * that leaves the building irreversibly, so it stays with the account holder
 * even when a team exists.
 */
const OWNER: Permission[] = [...ADMIN, 'content.publish', 'account.manage'];

const MATRIX: Record<AccountRole, readonly Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  member: MEMBER,
  viewer: VIEWER,
};

export function permissionsFor(role: AccountRole): readonly Permission[] {
  return MATRIX[role] ?? VIEWER;
}

export function can(role: AccountRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export function isAccountRole(value: unknown): value is AccountRole {
  return typeof value === 'string' && (ACCOUNT_ROLES as readonly string[]).includes(value);
}

export const ROLE_DESCRIPTIONS: Record<AccountRole, string> = {
  owner:
    'The account holder. Full control, and the only role that may publish content externally.',
  admin: 'Everything except publishing and account/security settings.',
  member: 'Can start missions and read the workspace, but cannot change agents or spend.',
  viewer: 'Read-only access to businesses, agents and finance.',
};
