import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api.js';
import type { ParticipantProfile } from '../types.js';

const FIELDS: {
  key: keyof ParticipantProfile;
  label: string;
  type?: string;
  options?: string[];
}[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'emergencyContactFirstName', label: 'Emergency contact — first name' },
  { key: 'emergencyContactLastName', label: 'Emergency contact — last name' },
  { key: 'emergencyContactPhone', label: 'Emergency contact — phone', type: 'tel' },
  { key: 'jerseySize', label: 'Jersey size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  {
    key: 'genderIdentity',
    label: 'Gender identity',
    options: ['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'],
  },
];

export default function ProfileForm({
  profile,
  missing,
  onSaved,
}: {
  profile: ParticipantProfile;
  missing: string[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [priorParticipation, setPrior] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const field of FIELDS) {
      const value = profile[field.key];
      initial[field.key as string] = value == null ? '' : String(value);
    }
    setDraft(initial);
    setPrior(profile.priorParticipation ?? null);
  }, [profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(draft)) {
        if (value !== '') payload[key] = value;
      }
      if (priorParticipation !== null) payload.priorParticipation = priorParticipation;

      await api.patch('/api/register/my-profile', payload);
      setStatus('Saved.');
      onSaved();
    } catch (error) {
      setStatus(error instanceof ApiFailure ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2>My details</h2>
      <p className="muted">
        Visible to the organizers and your coach. Correct anything that is wrong — a coach may
        have entered it for you.
      </p>

      {status && (
        <div className="notice ok" role="status">
          {status}
        </div>
      )}

      {FIELDS.map((field) => {
        const isMissing = missing.includes(field.key as string);
        return (
          <div className="field" key={field.key as string}>
            <label htmlFor={field.key as string}>
              {field.label}
              {isMissing && <span className="asterisk"> — needed</span>}
            </label>
            {field.options ? (
              <select
                id={field.key as string}
                value={draft[field.key as string] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [field.key as string]: e.target.value }))
                }
              >
                <option value="">Not set</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.key as string}
                type={field.type ?? 'text'}
                value={draft[field.key as string] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [field.key as string]: e.target.value }))
                }
              />
            )}
          </div>
        );
      })}

      <div className="field">
        <label htmlFor="prior">Played SCORES Cup before?</label>
        <select
          id="prior"
          value={priorParticipation === null ? '' : priorParticipation ? 'yes' : 'no'}
          onChange={(e) =>
            setPrior(e.target.value === '' ? null : e.target.value === 'yes')
          }
        >
          <option value="">Not set</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save my details'}
      </button>
    </form>
  );
}
