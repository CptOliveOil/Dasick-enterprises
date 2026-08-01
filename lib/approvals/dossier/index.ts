import 'server-only';
import type { DataStore } from '@/lib/db/tables';
import type { Approval } from '@/types/domain';
import { assembleDossier, registerDossier, resetDossiers } from './registry';
import { genericDossier } from './generic';
import { scriptDossier } from './script';
import { mediaDossier } from './media';
import { spendDossier } from './spend';
import type { Dossier } from './types';

/**
 * The built-in reviewers, registered in priority order.
 *
 * Registration is explicit rather than by import side effect, so the set of
 * builders is one readable list rather than something to be discovered by
 * tracing imports. Adding a business means adding a line here — or adding
 * nothing at all, since `genericDossier` already gives every kind a complete
 * review from its stored rows.
 */
export function registerBuiltInDossiers(): void {
  resetDossiers();
  registerDossier(scriptDossier);
  registerDossier(mediaDossier);
  registerDossier(spendDossier);
}

registerBuiltInDossiers();

/** Everything the operator needs in order to decide, for any approval. */
export async function buildDossier(
  store: DataStore,
  ownerId: string,
  approval: Approval,
): Promise<Dossier> {
  return assembleDossier({ store, ownerId, approval }, genericDossier);
}

export { registerDossier, registeredDossiers, resetDossiers } from './registry';
export type { DossierBuilder, DossierContext } from './registry';
export * from './types';
