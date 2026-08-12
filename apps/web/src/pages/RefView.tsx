import { useCallback, useEffect, useState } from 'react';
import { api, flushQueue, newClientId, pendingCount, sendOrQueue } from '../api.js';
import type { Card, Fixture, SessionUser } from '../types.js';
import MatchCard from '../components/MatchCard.js';
import AppHeader from '../components/AppHeader.js';

export default function RefView({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [cardsByFixture, setCardsByFixture] = useState<Record<string, Card[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(pendingCount());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ fixtures: Fixture[] }>('/api/ref/my-fixtures');
      setFixtures(res.fixtures);
      setError(null);
    } catch {
      setError('Could not refresh. Showing the last known schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCards = useCallback(async (fixtureId: string) => {
    const res = await api.get<{ cards: Card[] }>(`/api/ref/fixtures/${fixtureId}/cards`);
    setCardsByFixture((prev) => ({ ...prev, [fixtureId]: res.cards }));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retry anything held locally when the connection comes back, and on a slow
  // timer for the case where the browser never fires an 'online' event.
  useEffect(() => {
    const attempt = async () => {
      const { flushed } = await flushQueue();
      setPending(pendingCount());
      if (flushed > 0) void load();
    };

    window.addEventListener('online', attempt);
    const timer = window.setInterval(attempt, 20_000);
    return () => {
      window.removeEventListener('online', attempt);
      window.clearInterval(timer);
    };
  }, [load]);

  const submitScore = useCallback(
    async (fixture: Fixture, payload: Record<string, unknown>) => {
      const result = await sendOrQueue({
        id: `score:${fixture.id}`,
        method: 'PUT',
        path: `/api/ref/fixtures/${fixture.id}/score`,
        body: payload,
      });
      setPending(pendingCount());
      if (result.sent) await load();
      return result;
    },
    [load],
  );

  const addCard = useCallback(
    async (fixture: Fixture, teamId: string, type: 'yellow' | 'red', minute?: number) => {
      const clientId = newClientId();
      const result = await sendOrQueue({
        id: `card:${clientId}`,
        method: 'POST',
        path: `/api/ref/fixtures/${fixture.id}/cards`,
        body: { teamId, type, minute, clientId },
      });
      setPending(pendingCount());
      if (result.sent) await loadCards(fixture.id);
      return result;
    },
    [loadCards],
  );

  const removeCard = useCallback(
    async (fixture: Fixture, cardId: string) => {
      await api.delete(`/api/ref/fixtures/${fixture.id}/cards/${cardId}`);
      await loadCards(fixture.id);
    },
    [loadCards],
  );

  const signOff = useCallback(
    async (fixture: Fixture, teamId: string, captainName: string) => {
      const result = await sendOrQueue({
        id: `signoff:${fixture.id}:${teamId}`,
        method: 'POST',
        path: `/api/ref/fixtures/${fixture.id}/signoff`,
        body: { teamId, captainName },
      });
      setPending(pendingCount());
      if (result.sent) await load();
      return result;
    },
    [load],
  );

  const upcoming = fixtures.filter((f) => f.status !== 'complete');
  const finished = fixtures.filter((f) => f.status === 'complete');

  return (
    <div className="app">
      <AppHeader user={user} title="Referee" subtitle={user.displayName} onSignOut={onSignOut} />

      <div className="content">
        {pending > 0 && (
          <div className="notice pending" role="status">
            <strong>{pending}</strong> {pending === 1 ? 'entry is' : 'entries are'} saved on this
            phone and will upload when you have signal. You can keep going.
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {loading && <p className="muted center">Loading your games…</p>}

        {!loading && fixtures.length === 0 && (
          <div className="card center">
            <h2>No games assigned</h2>
            <p className="muted">
              You are not assigned to a field yet. Check with the tournament desk.
            </p>
          </div>
        )}

        {upcoming.length > 0 && <h2>Your games</h2>}
        {upcoming.map((fixture, index) => (
          <MatchCard
            key={fixture.id}
            fixture={fixture}
            highlight={index === 0}
            cards={cardsByFixture[fixture.id]}
            onLoadCards={() => loadCards(fixture.id)}
            onSubmitScore={(payload) => submitScore(fixture, payload)}
            onAddCard={(teamId, type, minute) => addCard(fixture, teamId, type, minute)}
            onRemoveCard={(cardId) => removeCard(fixture, cardId)}
            onSignOff={(teamId, captainName) => signOff(fixture, teamId, captainName)}
          />
        ))}

        {finished.length > 0 && (
          <>
            <h2 style={{ marginTop: '1.6rem' }}>Finished</h2>
            {finished.map((fixture) => (
              <MatchCard
                key={fixture.id}
                fixture={fixture}
                cards={cardsByFixture[fixture.id]}
                onLoadCards={() => loadCards(fixture.id)}
                onSubmitScore={(payload) => submitScore(fixture, payload)}
                onAddCard={(teamId, type, minute) => addCard(fixture, teamId, type, minute)}
                onRemoveCard={(cardId) => removeCard(fixture, cardId)}
                onSignOff={(teamId, captainName) => signOff(fixture, teamId, captainName)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
