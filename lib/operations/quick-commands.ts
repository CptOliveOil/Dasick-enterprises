import type { Business, Mission, Task } from '@/types/domain';
import type { NeedsYouItem } from './needs-you';

/**
 * Suggestions under the command bar.
 *
 * Every suggestion is a real sentence about the operator's actual state — a
 * mission number that exists, a channel they have, a count that is true. A
 * generic list ("try asking about your business!") is noise, and worse, it
 * teaches the operator that the suggestions are decoration.
 *
 * Nothing here runs. These fill the box; the operator sends it.
 */
export interface QuickCommand {
  label: string;
  /** What lands in the command bar. Often the same as the label. */
  command: string;
  /** Why this is being suggested now. */
  reason: string;
}

export interface QuickCommandInput {
  businesses: Business[];
  missions: Mission[];
  tasks: Task[];
  needsYou: NeedsYouItem[];
}

export function quickCommands(input: QuickCommandInput): QuickCommand[] {
  const suggestions: QuickCommand[] = [];

  const runnable = input.missions.filter(
    (mission) => mission.status === 'running' || mission.status === 'planning',
  );
  const blocked = input.missions.filter((mission) => mission.status === 'failed');
  const awaiting = input.missions.filter((mission) => mission.status === 'needs_approval');

  if (runnable.length > 0) {
    suggestions.push({
      label: "Continue everything that doesn't need me",
      command: 'Continue every mission that is not waiting on my approval.',
      reason: `${runnable.length} mission${runnable.length === 1 ? '' : 's'} can move without you.`,
    });
  }

  if (input.needsYou.length > 0) {
    suggestions.push({
      label: 'What needs approval?',
      command: 'What is waiting for my approval?',
      reason: `${input.needsYou.length} item${input.needsYou.length === 1 ? '' : 's'} waiting.`,
    });
  }

  if (blocked.length > 0) {
    const first = blocked[0]!;
    suggestions.push({
      label: 'Show blocked missions',
      command: 'Show me every blocked mission and why it stopped.',
      reason: `${blocked.length} mission${blocked.length === 1 ? '' : 's'} stopped.`,
    });
    suggestions.push({
      label: `Why is Mission #${String(first.number).padStart(3, '0')} blocked?`,
      command: `Why is Mission #${String(first.number).padStart(3, '0')} blocked?`,
      reason: first.title,
    });
  }

  // Channel-specific suggestions, named after channels that actually exist.
  const youtube = input.businesses.filter((business) => business.kind === 'youtube');
  for (const channel of youtube.slice(0, 2)) {
    const active = input.missions.filter(
      (mission) =>
        mission.business_id === channel.id &&
        !['completed', 'cancelled', 'failed'].includes(mission.status),
    ).length;
    suggestions.push(
      active === 0
        ? {
            label: `Find 5 new ideas for ${channel.name}`,
            command: `Find 5 new video ideas for ${channel.name}.`,
            reason: `${channel.name} has nothing in progress.`,
          }
        : {
            label: `Prepare another video for ${channel.name}`,
            command: `Prepare another video for ${channel.name}.`,
            reason: `${active} mission${active === 1 ? '' : 's'} already running there.`,
          },
    );
  }

  suggestions.push({
    label: "Show today's spending",
    command: 'How much have I spent today, and on what?',
    reason: 'Costs are recorded per task.',
  });

  if (awaiting.length === 0 && runnable.length === 0 && input.missions.length > 0) {
    suggestions.push({
      label: 'What should I do next?',
      command: 'What should I do next?',
      reason: 'Nothing is currently running.',
    });
  }

  return suggestions.slice(0, 6);
}
