'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EMPTY, useWorkforce } from '@/lib/store/workforce';
import { formatRelativeTime } from '@/lib/utils';
import { Badge, Button, EmptyState, Panel } from '@/components/ui';
import { PageShell } from '@/components/layout/PageShell';

/**
 * Every instruction the operator has given, and what came of it.
 *
 * "Run again" creates a *new* mission. It never touches the old one: a command
 * is a record of something that happened, and re-running it is a second thing
 * happening — rewriting the first would lose the history that makes this page
 * worth having.
 */
export default function CommandHistoryPage() {
  const messages = useWorkforce((s) => s.snapshot?.commandMessages) ?? EMPTY;
  const missions = useWorkforce((s) => s.snapshot?.missions) ?? EMPTY;
  const businesses = useWorkforce((s) => s.snapshot?.businesses) ?? EMPTY;
  const refresh = useWorkforce((s) => s.refresh);
  const router = useRouter();

  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commands = messages
    .filter((message) => message.role === 'user')
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const rerun = async (instruction: string, id: string) => {
    setRunning(id);
    setError(null);
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The command failed.');
      await refresh();
      router.push('/command');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The command failed.');
      setRunning(null);
    }
  };

  return (
    <PageShell
      title="Command history"
      description="Everything you have asked the workforce to do. Running a command again creates a new mission — it never changes the old one."
    >
      {error && (
        <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}

      {commands.length === 0 ? (
        <Panel>
          <EmptyState
            title="No commands yet"
            detail="Type an instruction into the command bar and it will appear here."
          />
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-[var(--color-edge-soft)]">
            {commands.map((message) => {
              const mission = missions.find((m) => m.id === message.mission_id) ?? null;
              const business = mission
                ? (businesses.find((b) => b.id === mission.business_id) ?? null)
                : null;
              return (
                <li key={message.id} className="px-3.5 py-3">
                  <p className="text-[13px] leading-relaxed">{message.content}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-ink-faint)]">
                    <span>{formatRelativeTime(message.created_at)}</span>
                    {business && <span>· {business.name}</span>}
                    {mission ? (
                      <>
                        <span>·</span>
                        <Link
                          href={`/missions/${mission.id}`}
                          className="text-amber-400 underline-offset-4 hover:underline"
                        >
                          Mission #{String(mission.number).padStart(3, '0')}
                        </Link>
                        <Badge
                          tone={
                            mission.status === 'completed'
                              ? 'emerald'
                              : mission.status === 'failed'
                                ? 'red'
                                : mission.status === 'needs_approval'
                                  ? 'amber'
                                  : 'neutral'
                          }
                        >
                          {mission.status.replace('_', ' ')}
                        </Badge>
                      </>
                    ) : (
                      <span>· no mission was created</span>
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    loading={running === message.id}
                    onClick={() => rerun(message.content, message.id)}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Run again
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}
