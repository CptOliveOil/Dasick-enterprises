'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useWorkforce } from '@/lib/store/workforce';
import { MISSION_STATUS_STYLES } from '@/lib/agents/status';
import { formatRelativeTime, missionLabel } from '@/lib/utils';
import { Button, EmptyState, Panel, ProgressBar, inputClass } from '@/components/ui';
import { PageShell, Section } from '@/components/layout/PageShell';

/**
 * The conversational face of the Manager Agent. Every message is tied to real
 * missions and tasks — nothing here is decorative chat.
 */
export default function CommandPage() {
  const snapshot = useWorkforce((s) => s.snapshot);
  const refresh = useWorkforce((s) => s.refresh);
  const busy = useWorkforce((s) => s.busy);
  const setBusy = useWorkforce((s) => s.setBusy);
  const select = useWorkforce((s) => s.select);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const messages = snapshot?.commandMessages ?? [];

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const instruction = value.trim();
    if (!instruction || busy) return;
    setValue('');
    setError(null);
    setBusy('Commanding workforce');
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The command failed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The command failed.');
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  return (
    <PageShell
      title="Command Centre"
      description="Give the Manager Agent an instruction. It decides which business the work belongs to, breaks the goal into tasks, assigns agents and tells you how many approvals to expect."
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel className="flex min-h-[52vh] flex-col overflow-hidden">
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <EmptyState
                title="No instructions yet"
                detail="Try: “Prepare a new faceless YouTube video about the Bronze Age collapse.”"
              />
            )}
            {messages.map((message) => {
              const mission = snapshot?.missions.find((m) => m.id === message.mission_id);
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                      isUser
                        ? 'bg-amber-500/12 text-[var(--color-ink)]'
                        : 'border border-[var(--color-edge)] bg-white/[0.03]'
                    }`}
                  >
                    <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                      {isUser ? 'You' : 'Commander'} · {formatRelativeTime(message.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                      {message.content}
                    </p>

                    {mission && !isUser && (
                      <button
                        onClick={() => select({ type: 'mission', id: mission.id })}
                        className="mt-2.5 block w-full rounded-lg border border-[var(--color-edge)] bg-black/25 p-2.5 text-left transition-colors hover:bg-black/40"
                      >
                        <p className="flex items-baseline gap-2">
                          <span className="font-mono text-[10px] text-amber-400">
                            MISSION {missionLabel(mission.number)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px]">
                            {mission.title}
                          </span>
                        </p>
                        <p
                          className={`mt-0.5 text-[11px] ${MISSION_STATUS_STYLES[mission.status].text}`}
                        >
                          {MISSION_STATUS_STYLES[mission.status].label} · {mission.progress}%
                        </p>
                        <ProgressBar
                          className="mt-1.5"
                          value={mission.progress}
                          label="Mission progress"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={end} />
          </div>

          <div className="border-t border-[var(--color-edge-soft)] p-3">
            {error && (
              <p className="mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Command your AI workforce…"
                aria-label="Instruction"
                className={inputClass}
                disabled={Boolean(busy)}
              />
              <Button variant="primary" onClick={send} loading={Boolean(busy)} disabled={!value.trim()}>
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
            {!snapshot?.aiLive && (
              <p className="mt-2 text-[11px] text-[var(--color-ink-faint)]">
                No AI provider configured — the Commander routes instructions with a keyword
                router and agents produce clearly-labelled simulated output.
              </p>
            )}
          </div>
        </Panel>

        <div>
          <Section title="Recent missions">
            <div className="space-y-1.5">
              {(snapshot?.missions ?? []).slice(0, 8).map((mission) => {
                const style = MISSION_STATUS_STYLES[mission.status];
                return (
                  <button
                    key={mission.id}
                    onClick={() => select({ type: 'mission', id: mission.id })}
                    className="w-full rounded-lg border border-[var(--color-edge)] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-amber-400">
                        {missionLabel(mission.number)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px]">{mission.title}</span>
                    </p>
                    <p className={`mt-0.5 text-[11px] ${style.text}`}>{style.label}</p>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </PageShell>
  );
}
