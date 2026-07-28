'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save, Wand2 } from 'lucide-react';
import { Button, Panel, inputClass } from '@/components/ui';
import type { ScriptSection, YoutubeScript } from '@/types/domain';

const REVISIONS = [
  { label: 'Shorten', instruction: 'Cut roughly 20% of the length without losing any factual content.' },
  { label: 'Expand', instruction: 'Add depth to the main sections. Aim for roughly 25% more length.' },
  {
    label: 'Make more engaging',
    instruction: 'Strengthen the hook and add a pattern interrupt. Keep the tone.',
  },
  { label: 'Rewrite', instruction: 'Rewrite the script from scratch, keeping the same facts and structure.' },
];

/** Section-by-section editing plus real agent revisions. Every save is a version. */
export function ScriptEditor({ script }: { script: YoutubeScript }) {
  const router = useRouter();
  const [sections, setSections] = useState<ScriptSection[]>(script.sections);
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = JSON.stringify(sections) !== JSON.stringify(script.sections);
  const wordCount = sections.reduce(
    (total, s) => total + s.body.trim().split(/\s+/).filter(Boolean).length,
    0,
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/youtube/scripts/${script.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, note: 'Manual edit' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      setNotice(`Saved as v${data.version}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const revise = async (label: string, instruction: string, sectionHeading?: string) => {
    setRevising(label);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/youtube/scripts/${script.id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, section_heading: sectionHeading }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The revision failed.');
      if (data.result?.status === 'failed') throw new Error(data.result.error);
      setSections(data.script.sections);
      setNotice(`Scriptwriter produced v${data.script.version}.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The revision failed.');
    } finally {
      setRevising(null);
    }
  };

  return (
    <div>
      <Panel className="mb-3 flex flex-wrap items-center gap-2 p-3">
        {REVISIONS.map((revision) => (
          <Button
            key={revision.label}
            size="sm"
            variant="secondary"
            loading={revising === revision.label}
            onClick={() => revise(revision.label, revision.instruction)}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {revision.label}
          </Button>
        ))}
        <span className="ml-auto text-[11px] text-[var(--color-ink-faint)]">
          {wordCount.toLocaleString('en-GB')} words · ~{Math.round(wordCount / 155)} min
        </span>
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
          <Save className="h-3.5 w-3.5" />
          Save as v{script.version + 1}
        </Button>
      </Panel>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
          {notice}
        </p>
      )}

      <div className="space-y-3">
        {sections.map((section, index) => (
          <Panel key={`${section.kind}-${index}`} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--color-ink-faint)]">
                {section.kind.replace('_', ' ')}
              </span>
              <input
                value={section.heading}
                onChange={(event) =>
                  setSections((current) =>
                    current.map((s, i) =>
                      i === index ? { ...s, heading: event.target.value } : s,
                    ),
                  )
                }
                aria-label={`Heading for section ${index + 1}`}
                className="min-w-0 flex-1 bg-transparent text-[14px] font-medium focus:outline-none"
              />
              <Button
                size="sm"
                variant="ghost"
                loading={revising === section.heading}
                onClick={() =>
                  revise(
                    section.heading,
                    'Regenerate this section. Keep the same facts and the same role in the script.',
                    section.heading,
                  )
                }
              >
                Regenerate
              </Button>
            </div>
            <textarea
              value={section.body}
              onChange={(event) =>
                setSections((current) =>
                  current.map((s, i) => (i === index ? { ...s, body: event.target.value } : s)),
                )
              }
              aria-label={`Body of section ${index + 1}`}
              rows={Math.min(16, Math.max(4, Math.ceil(section.body.length / 90)))}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}
