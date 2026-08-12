import { useEffect, useState } from 'react';
import type { Card, Fixture } from '../types.js';

interface Props {
  fixture: Fixture;
  highlight?: boolean;
  cards?: Card[];
  onLoadCards: () => void | Promise<void>;
  onSubmitScore: (payload: Record<string, unknown>) => Promise<{ sent: boolean }>;
  onAddCard: (
    teamId: string,
    type: 'yellow' | 'red',
    minute?: number,
  ) => Promise<{ sent: boolean }>;
  onRemoveCard: (cardId: string) => Promise<void>;
  onSignOff: (teamId: string, captainName: string) => Promise<{ sent: boolean }>;
}

function kickoffLabel(iso: string | null): string {
  if (!iso) return 'Time TBC';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function MatchCard({
  fixture,
  highlight,
  cards,
  onLoadCards,
  onSubmitScore,
  onAddCard,
  onRemoveCard,
  onSignOff,
}: Props) {
  const [home, setHome] = useState(fixture.homeScore ?? 0);
  const [away, setAway] = useState(fixture.awayScore ?? 0);
  const [homePk, setHomePk] = useState<number | ''>(fixture.homePenalties ?? '');
  const [awayPk, setAwayPk] = useState<number | ''>(fixture.awayPenalties ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [captainName, setCaptainName] = useState('');
  const [signingTeam, setSigningTeam] = useState<string | null>(null);

  useEffect(() => {
    setHome(fixture.homeScore ?? 0);
    setAway(fixture.awayScore ?? 0);
  }, [fixture.homeScore, fixture.awayScore]);

  useEffect(() => {
    if (expanded && cards === undefined) void onLoadCards();
  }, [expanded, cards, onLoadCards]);

  const complete = fixture.status === 'complete';
  const teamsKnown = Boolean(fixture.homeTeamId && fixture.awayTeamId);
  const isDraw = home === away;
  const knockout = fixture.stageName.toLowerCase().includes('bracket') || Boolean(fixture.round);

  async function save(finalise: boolean) {
    setBusy(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = {
        homeScore: home,
        awayScore: away,
        status: finalise ? 'complete' : 'in_progress',
      };
      if (knockout && isDraw && homePk !== '' && awayPk !== '') {
        payload.homePenalties = homePk;
        payload.awayPenalties = awayPk;
      }
      const result = await onSubmitScore(payload);
      setStatus(result.sent ? 'Saved.' : 'Saved on this phone — will upload when you have signal.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function card(teamId: string, type: 'yellow' | 'red') {
    setBusy(true);
    try {
      const result = await onAddCard(teamId, type);
      setStatus(
        result.sent
          ? `${type === 'yellow' ? 'Yellow' : 'Red'} card recorded.`
          : 'Card saved on this phone — will upload when you have signal.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function sign(teamId: string) {
    if (!captainName.trim()) {
      setStatus('Enter the captain’s name.');
      return;
    }
    setBusy(true);
    try {
      await onSignOff(teamId, captainName.trim());
      setStatus('Signed off.');
      setCaptainName('');
      setSigningTeam(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not sign off.');
    } finally {
      setBusy(false);
    }
  }

  const fixtureCards = cards ?? [];

  return (
    <section className={`card ${highlight ? 'live' : ''} ${complete ? 'done' : ''}`}>
      <div className="meta">
        <span className="pill">{fixture.fieldName ?? 'Field TBC'}</span>
        <span>{kickoffLabel(fixture.kickoffAt)}</span>
        <span>{fixture.divisionName}</span>
        {fixture.round && <span>{fixture.round}</span>}
        {complete && <span className="pill done">Final</span>}
        {highlight && !complete && <span className="pill live">Up now</span>}
      </div>

      {!teamsKnown ? (
        <p className="muted">
          Teams not decided yet — this game depends on earlier results.
        </p>
      ) : (
        <>
          <div className="matchup">
            <div className="side">
              <div className="name">{fixture.homeTeamName}</div>
              <div className="score">{home}</div>
              <div className="stepper">
                <button
                  className="step"
                  onClick={() => setHome((v) => Math.max(0, v - 1))}
                  disabled={busy}
                  aria-label={`Remove a goal from ${fixture.homeTeamName}`}
                >
                  −
                </button>
                <button
                  className="step"
                  onClick={() => setHome((v) => v + 1)}
                  disabled={busy}
                  aria-label={`Add a goal for ${fixture.homeTeamName}`}
                >
                  +
                </button>
              </div>
            </div>

            <div className="vs">v</div>

            <div className="side">
              <div className="name">{fixture.awayTeamName}</div>
              <div className="score">{away}</div>
              <div className="stepper">
                <button
                  className="step"
                  onClick={() => setAway((v) => Math.max(0, v - 1))}
                  disabled={busy}
                  aria-label={`Remove a goal from ${fixture.awayTeamName}`}
                >
                  −
                </button>
                <button
                  className="step"
                  onClick={() => setAway((v) => v + 1)}
                  disabled={busy}
                  aria-label={`Add a goal for ${fixture.awayTeamName}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Knockout draws go straight to penalties -- no extra time. */}
          {knockout && isDraw && (
            <div className="row" style={{ marginTop: '0.9rem' }}>
              <div>
                <label htmlFor={`hpk-${fixture.id}`}>Penalties — {fixture.homeTeamName}</label>
                <input
                  id={`hpk-${fixture.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={homePk}
                  onChange={(e) => setHomePk(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor={`apk-${fixture.id}`}>Penalties — {fixture.awayTeamName}</label>
                <input
                  id={`apk-${fixture.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={awayPk}
                  onChange={(e) => setAwayPk(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {status && (
            <div className="notice ok" role="status" style={{ marginTop: '0.9rem' }}>
              {status}
            </div>
          )}

          <div className="row" style={{ marginTop: '0.9rem' }}>
            <button onClick={() => void save(false)} disabled={busy}>
              Save progress
            </button>
            <button className="primary" onClick={() => void save(true)} disabled={busy}>
              {complete ? 'Update final score' : 'Finish match'}
            </button>
          </div>

          <button
            className="ghost"
            style={{ width: '100%', marginTop: '0.6rem' }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide cards & sign-off' : 'Cards & sign-off'}
            {fixtureCards.length > 0 ? ` (${fixtureCards.length})` : ''}
          </button>

          {expanded && (
            <div style={{ marginTop: '0.9rem' }}>
              {/* Cards are recorded against a team during play. Jerseys have no
                  numbers, so the captain names the player at sign-off. */}
              <p className="muted">
                Record the card against the team now. The captain names the player when they
                sign off.
              </p>

              {[
                { id: fixture.homeTeamId!, name: fixture.homeTeamName! },
                { id: fixture.awayTeamId!, name: fixture.awayTeamName! },
              ].map((team) => (
                <div key={team.id} style={{ marginTop: '0.75rem' }}>
                  <strong style={{ fontSize: '0.95rem' }}>{team.name}</strong>
                  <div className="row" style={{ marginTop: '0.4rem' }}>
                    <button className="yellow" onClick={() => void card(team.id, 'yellow')} disabled={busy}>
                      Yellow
                    </button>
                    <button className="red" onClick={() => void card(team.id, 'red')} disabled={busy}>
                      Red
                    </button>
                  </div>
                </div>
              ))}

              {fixtureCards.length > 0 && (
                <ul className="cards-list">
                  {fixtureCards.map((c) => (
                    <li key={c.id}>
                      <span className={`chip ${c.type}`} aria-hidden="true" />
                      <span style={{ flex: 1 }}>
                        {c.teamName}
                        {c.playerName ? ` — ${c.playerName}` : ' — player not named yet'}
                      </span>
                      <button
                        className="ghost danger"
                        style={{ minHeight: '2rem', padding: '0 .6rem' }}
                        onClick={() => void onRemoveCard(c.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '1rem 0' }} />

              <strong style={{ fontSize: '0.95rem' }}>Captain sign-off</strong>
              <p className="muted">
                Both captains confirm the score and card count. {fixture.signoffCount} of 2 signed.
              </p>

              <div className="field">
                <label htmlFor={`cap-${fixture.id}`}>Captain’s name</label>
                <input
                  id={`cap-${fixture.id}`}
                  value={captainName}
                  onChange={(e) => setCaptainName(e.target.value)}
                  placeholder="Who is signing?"
                />
              </div>

              <div className="row">
                <button
                  onClick={() => {
                    setSigningTeam(fixture.homeTeamId);
                    void sign(fixture.homeTeamId!);
                  }}
                  disabled={busy || signingTeam === fixture.homeTeamId}
                >
                  Sign for {fixture.homeTeamName}
                </button>
                <button
                  onClick={() => {
                    setSigningTeam(fixture.awayTeamId);
                    void sign(fixture.awayTeamId!);
                  }}
                  disabled={busy || signingTeam === fixture.awayTeamId}
                >
                  Sign for {fixture.awayTeamName}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
