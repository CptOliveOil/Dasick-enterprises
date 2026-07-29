import { listCapabilities } from './capabilities';

/**
 * The capability picker in the Agent Builder.
 *
 * Groups are presentation only. The list of *capabilities* is derived from the
 * handler registry, never hand-written here, so the builder can only ever offer
 * something the engine can actually execute. A capability with no handler would
 * produce an agent that fails every task it is given — the builder refuses it
 * on the server as well as hiding it in the UI.
 */
export interface CapabilityGroup {
  key: string;
  label: string;
  description: string;
  capabilities: { capability: string; label: string }[];
}

/** Which group a capability belongs to, by prefix. Order is display order. */
const GROUPS: { key: string; label: string; description: string; prefixes: string[] }[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    description: 'Research, scripting and the faceless video production pipeline.',
    prefixes: ['youtube.'],
  },
  {
    key: 'islamic',
    label: 'Islamic',
    description:
      'Sourced Islamic research and review. These handlers refuse to invent scripture, hadith or rulings.',
    prefixes: ['islamic.'],
  },
  {
    key: 'etsy',
    label: 'Etsy',
    description: 'Product opportunity research and listing copy.',
    prefixes: ['etsy.'],
  },
  {
    key: 'general',
    label: 'General',
    description: 'Cross-business work that is not tied to one platform.',
    prefixes: ['seo.', 'general.'],
  },
];

export function capabilityGroups(): CapabilityGroup[] {
  const all = listCapabilities().sort((a, b) => a.capability.localeCompare(b.capability));
  const claimed = new Set<string>();

  const groups = GROUPS.map((group) => {
    const capabilities = all.filter((item) => {
      const match = group.prefixes.some((prefix) => item.capability.startsWith(prefix));
      if (match) claimed.add(item.capability);
      return match;
    });
    return { key: group.key, label: group.label, description: group.description, capabilities };
  }).filter((group) => group.capabilities.length > 0);

  // A capability whose prefix nobody claims still has to be offerable, or
  // adding a handler would silently make it invisible to the builder.
  const rest = all.filter((item) => !claimed.has(item.capability));
  if (rest.length > 0) {
    groups.push({
      key: 'other',
      label: 'Other',
      description: 'Registered handlers that do not belong to a named group.',
      capabilities: rest,
    });
  }

  return groups;
}

/** Every capability the engine can execute, as a set. Used to reject the rest. */
export function supportedCapabilities(): Set<string> {
  return new Set(listCapabilities().map((item) => item.capability));
}

export function unsupportedCapabilities(candidates: string[]): string[] {
  const supported = supportedCapabilities();
  return candidates.filter((candidate) => !supported.has(candidate));
}
