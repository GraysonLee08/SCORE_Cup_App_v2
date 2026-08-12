import { useState, type FormEvent } from 'react';
import { api, ApiFailure } from '../api.js';

/**
 * Self-registration. The join code is checked first and the team confirmed
 * back, so nobody fills in a whole form only to discover they mistyped it.
 *
 * Only name, email and password are required — everything else can be added
 * later from "My details". An organiser can chase an incomplete profile; they
 * cannot chase someone who abandoned the form.
 */
export default function Register() {
  const [code, setCode] = useState('');
  const [team, setTeam] = useState<{ id: string; name: string; division: string } | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    emergencyContactFirstName: '',
    emergencyContactLastName: '',
    emergencyContactPhone: '',
    jerseySize: '',
    genderIdentity: '',
    dateOfBirth: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.get<{ team: { id: string; name: string; division: string } }>(
        `/api/register/team-by-code/${encodeURIComponent(code.trim())}`,
      );
      setTeam(res.team);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not check that code.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { joinCode: code.trim() };
      for (const [key, value] of Object.entries(form)) {
        if (value !== '') payload[key] = value;
      }
      await api.post('/api/register', payload);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : 'Could not register.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="login-wrap">
        <h1>You’re registered</h1>
        <div className="notice ok">
          You’re on <strong>{team?.name}</strong>. Sign in to see your schedule and teammates.
        </div>
        <a href="/sign-in">
          <button className="primary">Sign in</button>
        </a>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="login-wrap">
        <h1>Register</h1>
        <p className="muted">Your coach or captain has a code for your team.</p>
        <form className="card stack" onSubmit={lookUp}>
          {error && <div className="notice error">{error}</div>}
          <div className="field">
            <label htmlFor="code">Team code</label>
            <input
              id="code"
              value={code}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC234"
            />
          </div>
          <button className="primary" type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
        <p className="muted center">
          Just want to follow the scores? <a href="/">No account needed →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <h1>Join {team.name}</h1>
      <p className="muted">{team.division}</p>

      <form className="card stack" onSubmit={submit}>
        {error && <div className="notice error">{error}</div>}

        {(
          [
            ['firstName', 'First name', 'text', true],
            ['lastName', 'Last name', 'text', true],
            ['email', 'Email', 'email', true],
            ['password', 'Choose a password', 'password', true],
            ['phone', 'Phone', 'tel', false],
            ['emergencyContactFirstName', 'Emergency contact — first name', 'text', false],
            ['emergencyContactLastName', 'Emergency contact — last name', 'text', false],
            ['emergencyContactPhone', 'Emergency contact — phone', 'tel', false],
            ['dateOfBirth', 'Date of birth', 'date', false],
          ] as const
        ).map(([key, label, type, required]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>
              {label}
              {!required && <span className="muted"> (optional)</span>}
            </label>
            <input
              id={key}
              type={type}
              required={required}
              autoComplete={key === 'password' ? 'new-password' : undefined}
              autoCapitalize={type === 'email' ? 'none' : undefined}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}

        <div className="field">
          <label htmlFor="jerseySize">
            Jersey size <span className="muted">(optional)</span>
          </label>
          <select
            id="jerseySize"
            value={form.jerseySize}
            onChange={(e) => setForm((f) => ({ ...f, jerseySize: e.target.value }))}
          >
            <option value="">Not set</option>
            {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="genderIdentity">
            Gender identity <span className="muted">(optional)</span>
          </label>
          <select
            id="genderIdentity"
            value={form.genderIdentity}
            onChange={(e) => setForm((f) => ({ ...f, genderIdentity: e.target.value }))}
          >
            <option value="">Not set</option>
            {['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'].map(
              (option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ),
            )}
          </select>
          {/* Squad rules require at least two female-identifying players on the
              field, so this affects team sheets rather than being a statistic. */}
          <p className="muted" style={{ marginTop: '.3rem' }}>
            Used for squad composition — at least two female-identifying players must be on the
            field at all times.
          </p>
        </div>

        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Registering…' : 'Register'}
        </button>

        <p className="muted">
          You can add or correct anything later from “My details”.
        </p>
      </form>
    </div>
  );
}
