'use client';

import { useState } from 'react';
import { PlugZap } from 'lucide-react';
import { Badge, Button, Panel } from '@/components/ui';
import type { ProviderDescriptor } from '@/lib/integrations/providers/types';

/**
 * One media provider. Connection state comes from the server; "Test connection"
 * runs the provider's own cheapest round trip rather than guessing.
 */
export function ProviderPanel({ descriptor }: { descriptor: ProviderDescriptor }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: descriptor.kind }),
      });
      const data = await response.json();
      setResult({ ok: Boolean(data.ok), detail: String(data.detail ?? '') });
    } catch (error) {
      setResult({
        ok: false,
        detail: error instanceof Error ? error.message : 'The test failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Panel className="p-4">
      <p className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[13px] font-medium capitalize">{descriptor.kind}</span>
          <span className="block truncate text-[11px] text-[var(--color-ink-faint)]">
            {descriptor.name}
          </span>
        </span>
        <Badge
          tone={descriptor.simulated ? 'amber' : descriptor.connected ? 'emerald' : 'neutral'}
        >
          {descriptor.simulated
            ? 'Simulated'
            : descriptor.connected
              ? 'Connected'
              : 'Not connected'}
        </Badge>
      </p>

      {descriptor.capabilities.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1">
          {descriptor.capabilities.map((capability) => (
            <span
              key={capability}
              className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-[var(--color-ink-muted)]"
            >
              {capability}
            </span>
          ))}
        </p>
      )}

      {descriptor.pricingNote && (
        <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
          {descriptor.pricingNote}
        </p>
      )}

      {!descriptor.connected && descriptor.requiredEnv.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
          Set{' '}
          {descriptor.requiredEnv.map((name, i) => (
            <span key={name}>
              {i > 0 && ' and '}
              <code className="font-mono text-amber-300">{name}</code>
            </span>
          ))}{' '}
          on the server. Keys are never sent to the browser and are never shown again once saved.
        </p>
      )}

      <Button size="sm" variant="secondary" className="mt-3" loading={testing} onClick={test}>
        <PlugZap className="h-3.5 w-3.5" />
        Test connection
      </Button>

      {result && (
        <p
          className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug ${
            result.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
          }`}
        >
          {result.detail}
        </p>
      )}
    </Panel>
  );
}
