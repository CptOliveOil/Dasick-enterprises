import 'server-only';
import { buildApprovalReview } from '@/lib/approvals/review';
import type { DossierBuilder } from './registry';
import type { DossierPart, Metric } from './types';

/**
 * The review every approval gets when nothing more specific is registered.
 *
 * This is the floor, and the floor is deliberately high. It resolves whatever
 * the payload points at — rows in any table, arrays embedded in the payload, or
 * the payload itself — and shows all of it. An approval for a business that
 * does not exist yet, raised by an agent nobody has written a screen for, still
 * arrives as something an operator can read line by line and judge.
 *
 * That is the property the whole framework rests on: a specific builder makes a
 * review *better*, never possible.
 */
export const genericDossier: DossierBuilder = {
  id: 'generic',
  async build({ store, ownerId, approval }): Promise<DossierPart> {
    const review = await buildApprovalReview(store, ownerId, approval);

    const metrics: Metric[] = review.facts.map((fact) => ({
      label: fact.label,
      value: fact.value,
      tone: fact.tone,
    }));

    if (review.items.length > 0) {
      return {
        summary: { metrics, notice: review.notice },
        panels: [
          {
            kind: 'items',
            id: 'items',
            title: 'What was produced',
            subtitle:
              review.source === 'payload'
                ? 'Read back from the approval’s own snapshot — the original rows are no longer stored.'
                : 'Read back from the workspace exactly as it is stored.',
            items: review.items,
            itemNoun: 'item',
          },
        ],
        approveConsequence: review.action,
        href: review.href,
        source: review.source,
      };
    }

    // Nothing resolved. Say so plainly rather than showing a blank panel that
    // reads like "there was nothing worth showing" — an approval carrying no
    // reviewable content is itself the most important thing on the screen.
    return {
      summary: { metrics, notice: review.notice },
      panels: [
        {
          kind: 'fields',
          id: 'unreviewable',
          title: 'Nothing to inspect',
          note: 'This approval carries no reviewable content. Approving it would be a decision made blind — worth knowing before you take it.',
          fields: [
            { label: 'What the agent said', value: approval.summary, long: true },
            {
              label: 'Raw payload',
              value: JSON.stringify(approval.payload ?? {}, null, 2),
              long: true,
            },
          ],
        },
      ],
      approveConsequence: review.action,
      href: review.href,
      source: 'none',
    };
  },
};
