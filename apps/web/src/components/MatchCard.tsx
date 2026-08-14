import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, Fixture } from '../types.js';

export interface CardNaming {
  cardId: string;
  name: string;
}

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
  onSignOff: (
    teamId: string,
    captainName: string,
    cardNames: CardNaming[],
  ) => Promise<{ sent: boolean }>;
}

function kickoffLabel(iso: string | null): string {
  if (!iso) return 'Time TBC';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * One game, as a referee sees it on their phone.
 *
 * Everything that happens during play -- goals and cards -- is on the face of
 * the card and saves itself the moment it is tapped. There is no "save"
 * button, because a referee holding a phone in one hand at the end of a half
 * should not have to remember one, and an unsaved score is indistinguishable
 * from a game nobody has scored.
 *
 * Sign-off is the only thing behind a button, because it is the only thing
 * that happens once, at the end, with two other people present.
 */
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
  const [signingOff, setSigningOff] = useState(false);
  const [captainName, setCaptainName] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState<string[]>([]);

  const complete = fixture.status === 'complete';
  const teamsKnown = Boolean(fixture.homeTeamId && fixture.awayTeamId);
  const isDraw = home === away;
  const knockout = fixture.stageName.toLowerCase().includes('bracket') || Boolean(fixture.round);

  useEffect(() => {
    setHome(fixture.homeScore ?? 0);
    setAway(fixture.awayScore ?? 0);
  }, [fixture.homeScore, fixture.awayScore]);

  // Cards live on the face of the card now, so they are fetched up front
  // rather than when a panel is opened.
  useEffect(() => {
    if (teamsKnown && cards === undefined) void onLoadCards();
  }, [teamsKnown, cards, onLoadCards]);

  const persist = useCallback(
    async (finalise: boolean) => {
      setBusy(true);
      try {
        const payload: Record<string, unknown> = {
          homeScore: home,
          awayScore: away,
          status: finalise || complete ? 'complete' : 'in_progress',
        };
        if (knockout && isDraw && homePk !== '' && awayPk !== '') {
          payload.homePenalties = homePk;
          payload.awayPenalties = awayPk;
        }
        const result = await onSubmitScore(payload);
        setStatus(
          result.sent ? 'Saved.' : 'Saved on this phone — will upload when you have signal.',
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not save.');
      } finally {
        setBusy(false);
      }
    },
    [home, away, homePk, awayPk, complete, knockout, isDraw, onSubmitScore],
  );

  /**
   * What has actually reached the server, so a re-render or a score arriving
   * from a refresh does not trigger a save of something already saved.
   */
  const saved = useRef({ home: fixture.homeScore ?? 0, away: fixture.awayScore ?? 0 });

  useEffect(() => {
    if (!teamsKnown) return;
    if (home === saved.current.home && away === saved.current.away) return;

    // Briefly debounced: tapping + four times is one score, not four saves.
    const timer = window.setTimeout(() => {
      saved.current = { home, away };
      void persist(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [home, away, teamsKnown, persist]);

  async function addCard(teamId: string, type: 'yellow' | 'red') {
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
      // Only this team's cards travel with this signature. The server scopes
      // it too -- a captain cannot name players on the opposition's cards.
      const mine = (cards ?? [])
        .filter((c) => c.teamId === teamId)
        .map((c) => ({ cardId: c.id, name: names[c.id] ?? c.playerName ?? '' }))
        .filter((n) => n.name.trim().length > 0);

      await onSignOff(teamId, captainName.trim(), mine);
      setSigned((s) => [...s, teamId]);
      // Cleared so the other captain starts from an empty field rather than
      // signing their opposite number's name by accident.
      setCaptainName('');
      setStatus('Signed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not sign off.');
    } finally {
      setBusy(false);
    }
  }

  const fixtureCards = cards ?? [];
  const teams = teamsKnown
    ? [
        { id: fixture.homeTeamId!, name: fixture.homeTeamName! },
        { id: fixture.awayTeamId!, name: fixture.awayTeamName! },
      ]
    : [];

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
        <p className="muted">Teams not decided yet — this game depends on earlier results.</p>
      ) : (
        <>
          <div className="matchup">
            {[
              { side: 'home' as const, id: fixture.homeTeamId!, name: fixture.homeTeamName!, value: home, set: setHome },
              { side: 'away' as const, id: fixture.awayTeamId!, name: fixture.awayTeamName!, value: away, set: setAway },
            ].map((team, index) => (
              <FragmentWithVs key={team.id} showVs={index === 1}>
                <div className="side">
                  <div className="name">{team.name}</div>
                  <div className="score">{team.value}</div>
                  <div className="stepper">
                    <button
                      className="step"
                      onClick={() => team.set((v) => Math.max(0, v - 1))}
                      aria-label={`Remove a goal from ${team.name}`}
                    >
                      −
                    </button>
                    <button
                      className="step"
                      onClick={() => team.set((v) => v + 1)}
                      aria-label={`Add a goal for ${team.name}`}
                    >
                      +
                    </button>
                  </div>

                  {/* Cards go in as they are shown, not afterwards from memory. */}
                  <div className="row card-buttons">
                    <button
                      className="yellow"
                      onClick={() => void addCard(team.id, 'yellow')}
                      disabled={busy}
                    >
                      Yellow
                    </button>
                    <button
                      className="red"
                      onClick={() => void addCard(team.id, 'red')}
                      disabled={busy}
                    >
                      Red
                    </button>
                  </div>
                </div>
              </FragmentWithVs>
            ))}
          </div>

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
                  onBlur={() => void persist(complete)}
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
                  onBlur={() => void persist(complete)}
                />
              </div>
            </div>
          )}

          {fixtureCards.length > 0 && (
            <ul className="cards-list">
              {fixtureCards.map((c) => (
                <li key={c.id}>
                  <span className={`chip ${c.type}`} aria-hidden="true" />
                  <span style={{ flex: 1 }}>
                    {c.teamName}
                    {c.playerName ? ` — ${c.playerName}` : ' — player named at sign-off'}
                  </span>
                  <button
                    className="ghost danger"
                    style={{ minHeight: '2rem', padding: '0 .6rem' }}
                    onClick={() => void onRemoveCard(c.id)}
                    aria-label={`Remove ${c.type} card for ${c.teamName}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {status && (
            <div className="notice ok" role="status" style={{ marginTop: '0.9rem' }}>
              {status}
            </div>
          )}

          {!signingOff && (
            <button
              className="primary"
              style={{ width: '100%', marginTop: '0.9rem' }}
              disabled={busy}
              onClick={async () => {
                await persist(true);
                setSigningOff(true);
              }}
            >
              {complete ? 'Sign off' : 'Finish match'}
            </button>
          )}

          {signingOff && (
            <div className="signoff">
              <h3>
                Sign off — {fixture.homeTeamName} {home}–{away} {fixture.awayTeamName}
              </h3>
              <p className="muted">
                Each captain names anyone their own team had carded, then signs. {fixture.signoffCount} of 2 signed.
              </p>

              {teams.map((team) => {
                const theirs = fixtureCards.filter((c) => c.teamId === team.id);
                const done = signed.includes(team.id);

                return (
                  <div className="signoff-team" key={team.id}>
                    <div className="meta">
                      <strong style={{ flex: 1 }}>{team.name}</strong>
                      {done && <span className="pill done">Signed</span>}
                    </div>

                    {theirs.length === 0 ? (
                      <p className="muted">No cards.</p>
                    ) : (
                      theirs.map((c) => (
                        <div className="field" key={c.id}>
                          <label htmlFor={`name-${c.id}`}>
                            {c.type === 'yellow' ? 'Yellow' : 'Red'} card — who was it?
                          </label>
                          <input
                            id={`name-${c.id}`}
                            value={names[c.id] ?? c.playerName ?? ''}
                            disabled={done}
                            placeholder="Player’s name"
                            onChange={(e) =>
                              setNames((n) => ({ ...n, [c.id]: e.target.value }))
                            }
                          />
                        </div>
                      ))
                    )}

                    {!done && (
                      <>
                        <div className="field">
                          <label htmlFor={`cap-${fixture.id}-${team.id}`}>Captain’s name</label>
                          <input
                            id={`cap-${fixture.id}-${team.id}`}
                            value={captainName}
                            placeholder="Who is signing?"
                            onChange={(e) => setCaptainName(e.target.value)}
                          />
                        </div>
                        <button
                          className="primary"
                          style={{ width: '100%' }}
                          disabled={busy || !captainName.trim()}
                          onClick={() => void sign(team.id)}
                        >
                          Sign for {team.name}
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              <button
                className="ghost"
                style={{ width: '100%', marginTop: '0.6rem' }}
                onClick={() => setSigningOff(false)}
              >
                Back to the score
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Keeps the "v" between the two sides without a wrapper element per side. */
function FragmentWithVs({ showVs, children }: { showVs: boolean; children: React.ReactNode }) {
  return (
    <>
      {showVs && <div className="vs">v</div>}
      {children}
    </>
  );
}
