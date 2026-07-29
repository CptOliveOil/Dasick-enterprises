'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Field, Panel, inputClass } from '@/components/ui';
import { WEAK_HADITH_POLICY_LABELS, type SourcePolicy, type VisualRules } from '@/types/islamic';

/**
 * A channel's source and visual policy.
 *
 * Every control is a choice with a conservative default. Nothing here encodes a
 * madhhab, a school or a theological position — the application does not hold
 * one, and this is not the place to acquire one. What it does encode is
 * sourcing discipline, which is a different thing entirely.
 */
export function SourcePolicyForm({
  businessId,
  businessName,
  policy: initialPolicy,
  visual: initialVisual,
}: {
  businessId: string;
  businessName: string;
  policy: SourcePolicy;
  visual: VisualRules;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [visual, setVisual] = useState(initialVisual);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const setP = <K extends keyof SourcePolicy>(key: K, value: SourcePolicy[K]) =>
    setPolicy((current) => ({ ...current, [key]: value }));
  const setV = <K extends keyof VisualRules>(key: K, value: VisualRules[K]) =>
    setVisual((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/youtube/source-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          policy: {
            methodology_notes: policy.methodology_notes,
            preferred_translation: policy.preferred_translation,
            source_policy_notes: policy.source_policy_notes,
            arabic_display: policy.arabic_display,
            religious_disclaimer: policy.religious_disclaimer,
            require_quran_reference: policy.require_quran_reference,
            require_hadith_grading: policy.require_hadith_grading,
            require_source_check_before_script_approval:
              policy.require_source_check_before_script_approval,
            weak_hadith_policy: policy.weak_hadith_policy,
            require_difference_labelling: policy.require_difference_labelling,
          },
          visual: {
            no_prophet_depiction: visual.no_prophet_depiction,
            no_divine_depiction: visual.no_divine_depiction,
            no_generated_sacred_text: visual.no_generated_sacred_text,
            require_calligraphy_approval: visual.require_calligraphy_approval,
            human_depiction: visual.human_depiction,
            background_music: visual.background_music,
            extra_notes: visual.extra_notes,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save.');
      setMessage({ ok: true, text: 'Saved. These apply to every mission on this channel.' });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Could not save.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Sourcing requirements</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          These reach the Islamic agents as instructions, and the ones that can be checked
          afterwards are enforced on what comes back. They apply to {businessName} only.
        </p>

        <div className="mt-3 space-y-2">
          <Toggle
            label="Require a Qur’an reference wherever a verse is used"
            detail="A verse with no surah and ayah is flagged rather than presented."
            checked={policy.require_quran_reference}
            onChange={(value) => setP('require_quran_reference', value)}
          />
          <Toggle
            label="Require a grading on every hadith"
            detail="Where the grading is not established, the agent must say “unknown” rather than assume."
            checked={policy.require_hadith_grading}
            onChange={(value) => setP('require_hadith_grading', value)}
          />
          <Toggle
            label="Require a source check before a script can be approved"
            detail="Script approval is refused until the Islamic Source Checker has run and not blocked it."
            checked={policy.require_source_check_before_script_approval}
            onChange={(value) => setP('require_source_check_before_script_approval', value)}
          />
          <Toggle
            label="Require differences of opinion to be labelled"
            detail="Where scholars differ, the content must say so rather than presenting one view as settled."
            checked={policy.require_difference_labelling}
            onChange={(value) => setP('require_difference_labelling', value)}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Weak hadith">
            <select
              value={policy.weak_hadith_policy}
              onChange={(event) =>
                setP('weak_hadith_policy', event.target.value as SourcePolicy['weak_hadith_policy'])
              }
              className={inputClass}
            >
              {Object.entries(WEAK_HADITH_POLICY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preferred Qur’an translation" hint="Free text. Left blank, none is imposed.">
            <input
              value={policy.preferred_translation}
              onChange={(event) => setP('preferred_translation', event.target.value)}
              className={inputClass}
              maxLength={200}
              placeholder="e.g. Saheeh International"
            />
          </Field>
          <Field label="Arabic display">
            <select
              value={policy.arabic_display}
              onChange={(event) =>
                setP('arabic_display', event.target.value as SourcePolicy['arabic_display'])
              }
              className={inputClass}
            >
              <option value="arabic_with_translation">Arabic with translation</option>
              <option value="arabic_only">Arabic only</option>
              <option value="translation_only">Translation only</option>
              <option value="none">No Arabic</option>
            </select>
          </Field>
        </div>

        <div className="mt-3 space-y-3">
          <Field
            label="Methodology notes"
            hint="Optional. Describe the approach this channel follows; nothing is assumed."
          >
            <textarea
              value={policy.methodology_notes}
              onChange={(event) => setP('methodology_notes', event.target.value)}
              rows={3}
              className={`${inputClass} resize-y`}
              maxLength={4000}
            />
          </Field>
          <Field label="Citation preferences" hint="How sources should appear on screen and in descriptions.">
            <textarea
              value={policy.source_policy_notes}
              onChange={(event) => setP('source_policy_notes', event.target.value)}
              rows={2}
              className={`${inputClass} resize-y`}
              maxLength={4000}
            />
          </Field>
          <Field label="Religious content disclaimer" hint="Shown with the channel’s content, if you use one.">
            <textarea
              value={policy.religious_disclaimer}
              onChange={(event) => setP('religious_disclaimer', event.target.value)}
              rows={2}
              className={`${inputClass} resize-y`}
              maxLength={1000}
            />
          </Field>
        </div>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-[13px] font-semibold">Visual restrictions</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
          These reach the Visual Director and the Asset Agent as hard constraints, and are checked
          again against the plan that comes back. A scene that breaks one stops the mission before
          any money is spent generating it.
        </p>

        <div className="mt-3 space-y-2">
          <Toggle
            label="Do not depict Prophets"
            detail="Including a figure standing in for one. Landscape, architecture, manuscript and abstract imagery are used instead."
            checked={visual.no_prophet_depiction}
            onChange={(value) => setV('no_prophet_depiction', value)}
          />
          <Toggle
            label="Do not visually depict Allah"
            checked={visual.no_divine_depiction}
            onChange={(value) => setV('no_divine_depiction', value)}
          />
          <Toggle
            label="Never generate sacred text as imagery"
            detail="Image models corrupt Arabic. Verified wording is rendered as a text layer instead, from structured data."
            checked={visual.no_generated_sacred_text}
            onChange={(value) => setV('no_generated_sacred_text', value)}
          />
          <Toggle
            label="Arabic calligraphy needs manual approval"
            checked={visual.require_calligraphy_approval}
            onChange={(value) => setV('require_calligraphy_approval', value)}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Human depiction">
            <select
              value={visual.human_depiction}
              onChange={(event) =>
                setV('human_depiction', event.target.value as VisualRules['human_depiction'])
              }
              className={inputClass}
            >
              <option value="none">No people at all</option>
              <option value="faceless">Silhouettes and faces out of frame only</option>
              <option value="allowed">People may be depicted</option>
            </select>
          </Field>
          <Field label="Background music">
            <select
              value={visual.background_music}
              onChange={(event) =>
                setV('background_music', event.target.value as VisualRules['background_music'])
              }
              className={inputClass}
            >
              <option value="none">None — narration and ambience only</option>
              <option value="ambient_only">Non-instrumental ambience only</option>
              <option value="allowed">Permitted</option>
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Additional visual notes">
            <textarea
              value={visual.extra_notes}
              onChange={(event) => setV('extra_notes', event.target.value)}
              rows={2}
              className={`${inputClass} resize-y`}
              maxLength={4000}
            />
          </Field>
        </div>
      </Panel>

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-[12px] ${
            message.ok
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/25 bg-red-500/10 text-red-300'
          }`}
        >
          {message.text}
        </p>
      )}

      <Button onClick={save} loading={saving} variant="primary">
        <Save className="h-3.5 w-3.5" />
        Save policy
      </Button>
    </div>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-amber-400"
      />
      <span className="min-w-0">
        <span className="block text-[12.5px]">{label}</span>
        {detail && (
          <span className="block text-[11px] leading-snug text-[var(--color-ink-faint)]">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}
