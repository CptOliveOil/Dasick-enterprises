'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save, Volume2 } from 'lucide-react';
import { Badge, Button, Field, Panel, inputClass } from '@/components/ui';
import { Section } from '@/components/layout/PageShell';
import type { ProductionBudget, ProductionSettings } from '@/types/production';
import type { ProviderDescriptor } from '@/lib/integrations/providers/types';

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  language: string;
}

/**
 * Voice, render, caption, music, budget and publishing settings.
 *
 * When no voice provider is connected this says so rather than listing voices
 * that cannot be used.
 */
export function ProductionSettingsForm({
  settings: initialSettings,
  budget: initialBudget,
  voiceProvider,
  voices,
}: {
  settings: ProductionSettings;
  budget: ProductionBudget;
  voiceProvider: ProviderDescriptor;
  voices: VoiceOption[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [budget, setBudget] = useState(initialBudget);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/youtube/production-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            voice_id: settings.voice_id,
            voice_name: settings.voice_name,
            voice_speed: settings.voice_speed,
            language: settings.language,
            narration_style: settings.narration_style,
            width: settings.width,
            height: settings.height,
            fps: settings.fps,
            captions_enabled: settings.captions_enabled,
            burn_in_captions: settings.burn_in_captions,
            music_mode: settings.music_mode,
            music_volume: settings.music_volume,
            music_fade_in: settings.music_fade_in,
            music_fade_out: settings.music_fade_out,
            auto_publish_after_approval: settings.auto_publish_after_approval,
          },
          budget: {
            max_cost_per_video: budget.max_cost_per_video,
            max_image_spend: budget.max_image_spend,
            max_video_spend: budget.max_video_spend,
            max_voice_spend: budget.max_voice_spend,
            approval_threshold: budget.approval_threshold,
            concurrency: budget.concurrency,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      setNotice('Saved.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const testVoice = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'voice' }),
      });
      const data = await response.json();
      setNotice(data.ok ? `Voice provider reachable — ${data.detail}` : null);
      if (!data.ok) setError(data.detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Section title="Voice">
        <Panel className="p-4">
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            {voiceProvider.name}
            <Badge
              tone={
                voiceProvider.simulated ? 'amber' : voiceProvider.connected ? 'emerald' : 'neutral'
              }
            >
              {voiceProvider.simulated
                ? 'Simulated (Demo Mode)'
                : voiceProvider.connected
                  ? 'Connected'
                  : 'Not connected'}
            </Badge>
            <Button size="sm" variant="secondary" loading={testing} onClick={testVoice}>
              <Volume2 className="h-3.5 w-3.5" />
              Test voice
            </Button>
          </p>

          {!voiceProvider.connected && (
            <p className="mb-3 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
              No voice provider is connected, so narration cannot be generated and the pipeline
              will stop at the voiceover step. Set{' '}
              {voiceProvider.requiredEnv.map((name, i) => (
                <span key={name}>
                  {i > 0 && ' and '}
                  <code className="font-mono text-[11px] text-amber-300">{name}</code>
                </span>
              ))}{' '}
              on the server and register an adapter in{' '}
              <code className="font-mono text-[11px]">lib/integrations/providers</code>.
            </p>
          )}

          {voiceProvider.simulated && (
            <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-amber-100/80">
              Demo Mode is generating silent placeholder narration of the correct length so the
              rest of the pipeline can be demonstrated. It is not speech.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Voice">
              {voices.length > 0 ? (
                <select
                  value={settings.voice_id}
                  onChange={(event) => {
                    const voice = voices.find((v) => v.id === event.target.value);
                    setSettings({
                      ...settings,
                      voice_id: event.target.value,
                      voice_name: voice?.name ?? '',
                    });
                  }}
                  className={inputClass}
                >
                  <option value="">Choose a voice…</option>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} — {voice.description}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={settings.voice_id}
                  onChange={(event) => setSettings({ ...settings, voice_id: event.target.value })}
                  placeholder="No voices available — connect a provider"
                  className={inputClass}
                  disabled={!voiceProvider.connected}
                />
              )}
            </Field>

            <Field label={`Speed — ${settings.voice_speed.toFixed(2)}×`}>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.voice_speed}
                onChange={(event) =>
                  setSettings({ ...settings, voice_speed: Number(event.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </Field>

            <Field label="Language">
              <input
                value={settings.language}
                onChange={(event) => setSettings({ ...settings, language: event.target.value })}
                className={inputClass}
              />
            </Field>

            <Field label="Narration style">
              <input
                value={settings.narration_style}
                onChange={(event) =>
                  setSettings({ ...settings, narration_style: event.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>
      </Section>

      <Section title="Video and captions">
        <Panel className="grid gap-3 p-4 md:grid-cols-3">
          <Field label="Width">
            <input
              type="number"
              value={settings.width}
              onChange={(event) => setSettings({ ...settings, width: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              value={settings.height}
              onChange={(event) => setSettings({ ...settings, height: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
          <Field label="Frames per second">
            <input
              type="number"
              value={settings.fps}
              onChange={(event) => setSettings({ ...settings, fps: Number(event.target.value) })}
              className={inputClass}
            />
          </Field>
          <Toggle
            label="Generate caption files"
            hint="Produces SRT and WebVTT alongside the video."
            checked={settings.captions_enabled}
            onChange={(captions_enabled) => setSettings({ ...settings, captions_enabled })}
          />
          <Toggle
            label="Burn captions into the picture"
            hint="Otherwise captions stay as separate uploadable files."
            checked={settings.burn_in_captions}
            onChange={(burn_in_captions) => setSettings({ ...settings, burn_in_captions })}
          />
        </Panel>
      </Section>

      <Section title="Background music">
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Source">
              <select
                value={settings.music_mode}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    music_mode: event.target.value as ProductionSettings['music_mode'],
                  })
                }
                className={inputClass}
              >
                <option value="none">No music</option>
                <option value="uploaded">Uploaded track</option>
                <option value="provider">Licensed provider</option>
              </select>
            </Field>
            <Field label={`Volume — ${Math.round(settings.music_volume * 100)}%`}>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={settings.music_volume}
                onChange={(event) =>
                  setSettings({ ...settings, music_volume: Number(event.target.value) })
                }
                className="w-full accent-amber-400"
              />
            </Field>
            <Field label="Fade in (s)">
              <input
                type="number"
                min={0}
                max={15}
                value={settings.music_fade_in}
                onChange={(event) =>
                  setSettings({ ...settings, music_fade_in: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Fade out (s)">
              <input
                type="number"
                min={0}
                max={15}
                value={settings.music_fade_out}
                onChange={(event) =>
                  setSettings({ ...settings, music_fade_out: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--color-ink-faint)]">
            Only music you have uploaded or licensed is used. Command Centre does not source
            commercial tracks.
          </p>
        </Panel>
      </Section>

      <Section title="Production budget">
        <Panel className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Max cost per video (£)" hint="A hard ceiling. Never exceeded.">
              <input
                type="number"
                step="0.5"
                value={budget.max_cost_per_video}
                onChange={(event) =>
                  setBudget({ ...budget, max_cost_per_video: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Approval threshold (£)" hint="Any step estimated above this stops for you.">
              <input
                type="number"
                step="0.5"
                value={budget.approval_threshold}
                onChange={(event) =>
                  setBudget({ ...budget, approval_threshold: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Concurrent generations" hint="How many assets may be produced at once.">
              <input
                type="number"
                min={1}
                max={8}
                value={budget.concurrency}
                onChange={(event) =>
                  setBudget({ ...budget, concurrency: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max image spend (£)">
              <input
                type="number"
                step="0.5"
                value={budget.max_image_spend}
                onChange={(event) =>
                  setBudget({ ...budget, max_image_spend: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max video spend (£)">
              <input
                type="number"
                step="0.5"
                value={budget.max_video_spend}
                onChange={(event) =>
                  setBudget({ ...budget, max_video_spend: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max voice spend (£)">
              <input
                type="number"
                step="0.5"
                value={budget.max_voice_spend}
                onChange={(event) =>
                  setBudget({ ...budget, max_voice_spend: Number(event.target.value) })
                }
                className={inputClass}
              />
            </Field>
          </div>
        </Panel>
      </Section>

      <Section title="Publishing">
        <Panel className="p-4">
          <Toggle
            label="Allow auto-publish after final approval"
            hint="Off by default. Publishing is an external action; leaving this off means approved videos stay READY TO PUBLISH until you upload them."
            checked={settings.auto_publish_after_approval}
            onChange={(auto_publish_after_approval) =>
              setSettings({ ...settings, auto_publish_after_approval })
            }
          />
        </Panel>
      </Section>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} loading={saving}>
          <Save className="h-3.5 w-3.5" />
          Save settings
        </Button>
        {notice && <span className="text-[12px] text-emerald-300">{notice}</span>}
        {error && <span className="text-[12px] text-red-300">{error}</span>}
      </div>
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
      />
      <span>
        <span className="block text-[13px]">{label}</span>
        {hint && (
          <span className="block text-[11px] leading-snug text-[var(--color-ink-faint)]">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
