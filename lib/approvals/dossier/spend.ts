import 'server-only';
import { getAiBudget, missionSpend, monthToDateSpend } from '@/lib/finance/ai-budget';
import type { DossierBuilder } from './registry';
import type { DossierPart, LedgerLine } from './types';

/**
 * A spending approval, shown as the money it actually is.
 *
 * "An agent needs £0.14, approve?" is unanswerable in isolation. The question
 * an operator is really being asked is whether this step is worth it *given
 * what has already gone and what is left*, so the ceiling, the month to date,
 * what this mission has cost so far and what would remain afterwards are all on
 * screen together.
 *
 * Approving here authorises one step. It does not raise a ceiling, and nothing
 * in this file can — the budget is owner-only at the database level, and an
 * agent has no session with which to write to it.
 */
export const spendDossier: DossierBuilder = {
  id: 'spend',
  kinds: ['spend'],

  async build({ store, ownerId, approval }): Promise<DossierPart | null> {
    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const estimate = typeof payload.estimate === 'number' ? payload.estimate : null;

    const budget = await getAiBudget(store, ownerId).catch(() => null);
    const [month, mission] = await Promise.all([
      monthToDateSpend(store, ownerId).catch(() => 0),
      approval.mission_id
        ? missionSpend(store, ownerId, approval.mission_id).catch(() => 0)
        : Promise.resolve(0),
    ]);

    const money = (value: number) => `£${value.toFixed(2)}`;
    const lines: LedgerLine[] = [];

    if (estimate !== null) {
      lines.push({
        label: 'This step would spend',
        value: money(estimate),
        emphasis: true,
        tone: 'amber',
        hint: 'An estimate priced at the dearest model that could serve the request, so it is never optimistic.',
      });
    }

    lines.push({
      label: 'This mission so far',
      value: money(mission),
      hint: 'Everything already spent getting to this point.',
    });
    lines.push({ label: 'This month so far', value: money(month) });

    if (budget) {
      const remaining = budget.monthly_ceiling - month;
      const after = estimate === null ? remaining : remaining - estimate;
      lines.push({
        label: 'Monthly ceiling',
        value: money(budget.monthly_ceiling),
        hint: 'You set this. Nothing in the system can raise it — not an agent, and not an approval.',
      });
      lines.push({
        label: 'Left after approving',
        value: money(after),
        tone: after <= 0 ? 'red' : after < budget.monthly_ceiling * 0.2 ? 'amber' : 'emerald',
      });
      if (budget.per_mission_ceiling > 0) {
        lines.push({
          label: 'Per-mission ceiling',
          value: money(budget.per_mission_ceiling),
          tone:
            estimate !== null && mission + estimate > budget.per_mission_ceiling
              ? 'red'
              : 'neutral',
        });
      }
    } else {
      lines.push({
        label: 'Monthly ceiling',
        value: 'Not set',
        tone: 'red',
        hint: 'No budget has been activated, so nothing can spend yet. Settings → AI budget.',
      });
    }

    return {
      summary: {
        title: approval.title,
        metrics:
          estimate === null
            ? []
            : [{ label: 'Estimate', value: money(estimate), tone: 'amber' }],
        notice: budget
          ? null
          : 'No AI budget is activated for this workspace. Approving will not make the step run.',
      },
      panels: [
        {
          kind: 'ledger',
          id: 'money',
          title: 'What this costs',
          subtitle: 'Everything the decision depends on, in one place.',
          lines,
        },
        {
          kind: 'fields',
          id: 'what',
          title: 'What the money is for',
          fields: [
            { label: 'The step', value: approval.summary, long: true },
            ...(typeof payload.capability === 'string'
              ? [{ label: 'Capability', value: payload.capability }]
              : []),
            ...(typeof payload.model === 'string'
              ? [{ label: 'Model', value: payload.model }]
              : []),
          ],
        },
      ],
      approveConsequence:
        'The step runs and spends up to that estimate. Your ceilings are unchanged, and nothing else is authorised.',
      source: 'records',
    };
  },
};
