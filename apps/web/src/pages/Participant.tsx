import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiFailure } from '../api.js';
import type {
  MyTeam,
  ParticipantProfile,
  PublicDivision,
  SessionUser,
} from '../types.js';
import FixtureList from '../components/FixtureList.js';
import StandingsTable from '../components/StandingsTable.js';
import Bracket from '../components/Bracket.js';
import ProfileForm from '../components/ProfileForm.js';

type Tab = 'team' | 'standings' | 'roster' | 'profile';

export default function Participant({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const [me, setMe] = useState<MyTeam | null>(null);
  const [division, setDivision] = useState<PublicDivision | null>(null);
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('team');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const mine = await api.get<MyTeam>('/api/participant/me');
      setMe(mine);
      setDivision(await api.get<PublicDivision>(`/api/public/divisions/${mine.division.id}`));
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiFailure ? err.message : 'Could not load your team.',
      );
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await api.get<{ profile: ParticipantProfile; missingFields: string[] }>(
        '/api/register/my-profile',
      );
      setProfile(res.profile);
      setMissing(res.missingFields);
    } catch {
      setProfile(null); // coaches have no player row of their own
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfile();
  }, [load, loadProfile]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const myFixtures = useMemo(() => {
    if (!division || !me) return [];
    return division.fixtures.filter(
      (f) => f.homeTeamId === me.team.id || f.awayTeamId === me.team.id,
    );
  }, [division, me]);

  const next = myFixtures.find((f) => f.homeScore == null);
  const played = myFixtures.filter((f) => f.homeScore != null);
  const myPool = division?.pools.find((p) =>
    p.rows.some((r) => r.teamId === me?.team.id),
  );

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <strong>{me?.team.name ?? 'My team'}</strong>
          <div className="who">{me?.division.name ?? user.displayName}</div>
        </div>
        <button
          className="ghost"
          onClick={onSignOut}
          style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)', background: 'transparent' }}
        >
          Sign out
        </button>
      </header>

      <div className="content">
        {error && (
          <div className="notice error" role="alert">
            {error}
            <div style={{ marginTop: '.5rem' }}>
              <a href="/">See the full tournament instead →</a>
            </div>
          </div>
        )}

        {missing.length > 0 && tab !== 'profile' && (
          <div className="notice pending">
            Your registration is missing {missing.length}{' '}
            {missing.length === 1 ? 'detail' : 'details'}.{' '}
            <button
              className="ghost"
              style={{ minHeight: 'auto', padding: '.2rem .5rem' }}
              onClick={() => setTab('profile')}
            >
              Complete it
            </button>
          </div>
        )}

        {me?.messages?.map((m) => (
          <div className="notice ok" key={m.id}>
            <strong>{m.title}</strong>
            <div>{m.message}</div>
          </div>
        ))}

        <nav className="tabs" aria-label="Sections">
          {(
            [
              ['team', 'My games'],
              ['standings', 'Standings'],
              ['roster', 'Roster'],
              ['profile', 'My details'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'team' && (
          <>
            {next && (
              <>
                <h2>Next game</h2>
                <FixtureList fixtures={[next]} showField />
              </>
            )}
            <h2>All your games</h2>
            <FixtureList fixtures={myFixtures} showField />
            {played.length > 0 && division && (
              <>
                <h2>Bracket</h2>
                <Bracket fixtures={division.fixtures.filter((f) => f.stageKind === 'bracket')} />
              </>
            )}
          </>
        )}

        {tab === 'standings' && (
          <>
            {myPool ? (
              <StandingsTable pool={myPool} highlightTeamId={me?.team.id} />
            ) : (
              <p className="muted">Standings will appear once games are played.</p>
            )}
            <p className="muted">
              <a href="/">See every pool and the full bracket →</a>
            </p>
          </>
        )}

        {tab === 'roster' && me && (
          <section className="card">
            <h2>{me.team.name}</h2>
            <p className="muted">
              Contact details are visible to your team only.
            </p>
            <ul className="cards-list">
              {me.teammates.map((p) => (
                <li key={p.id} style={{ display: 'block' }}>
                  <strong>
                    {p.firstName} {p.lastName}
                  </strong>
                  {p.isCaptain && <span className="pill" style={{ marginLeft: '.4rem' }}>Captain</span>}
                  {!p.registered && (
                    <span className="pill" style={{ marginLeft: '.4rem' }}>Not registered</span>
                  )}
                  <div className="muted">
                    {[p.email, p.phone].filter(Boolean).join(' · ') || 'No contact details yet'}
                  </div>
                </li>
              ))}
            </ul>
            {me.teammates.length === 0 && (
              <p className="muted">No one on the roster yet.</p>
            )}
          </section>
        )}

        {tab === 'profile' && (
          <ProfileForm
            profile={profile}
            missing={missing}
            onSaved={() => void loadProfile()}
          />
        )}
      </div>
    </div>
  );
}
