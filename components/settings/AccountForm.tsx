'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Field, inputClass } from '@/components/ui';
import type { Profile } from '@/types/domain';

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Jakarta',
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
];

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AED', 'CAD', 'AUD', 'PKR', 'MYR', 'SAR'];

/** Editable account details. Email and role are shown but not editable here. */
export function AccountForm({ profile, editable }: { profile: Profile; editable: boolean }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [currency, setCurrency] = useState(profile.currency);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    displayName !== profile.display_name ||
    timezone !== profile.timezone ||
    currency !== profile.currency;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, timezone, currency }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Your account could not be updated.');
      setMessage({ ok: true, text: 'Saved.' });
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : 'Your account could not be updated.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={inputClass}
            maxLength={80}
            disabled={!editable}
          />
        </Field>
        <Field label="Email">
          <input value={profile.email || '—'} className={inputClass} disabled readOnly />
        </Field>
        <Field label="Timezone">
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={inputClass}
            disabled={!editable}
          >
            {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default currency">
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className={inputClass}
            disabled={!editable}
          >
            {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

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

      <Button size="sm" onClick={save} loading={saving} disabled={!editable || !dirty}>
        <Save className="h-3.5 w-3.5" />
        Save changes
      </Button>
    </div>
  );
}
