import { useEffect, useState } from 'react';
import { api, ApiFailure } from '../../../api.js';
import { byeCount, nextPowerOfTwo } from '@scores-cup/engine';
import type { AdminEvent } from '../../../types.js';

/**
 * How many teams reach the playoffs.
 *
 * Any number works, not just 4, 8 or 16. A knockout needs a power-of-two
 * bracket, so anything else is padded up and the spare slots become byes,
 * which fall to the top seeds. The shape is drawn out below the input rather
 * than described, because "6 teams means 2 byes" is much easier to check by
 * looking at it.
 */
export default function PlayoffsWidget({
  data,
  onChanged,
}: {
  data: AdminEvent;
  onChanged: () => void;
}) {
  const [divisionId, setDivisionId] = useState(data.divisions[0]?.id ?? '');
  const division = data.divisions.find((d) => d.id === divisionId) ?? data.divisions[0];

  const bracketStage = division?.stages.find((s) => s.kind === 'bracket');
  const config = (bracketStage?.config ?? {}) as {
    qualifiers?: number;
    advancePerPool?: number;
    thirdPlaceGame?: boolean;
  };
  const stored =
    config.qualifiers ?? (config.advancePerPool ?? 0) * (division?.pools.length || 1);

  const [qualifiers, setQualifiers] = useState(stored || 4);
  const [thirdPlace, setThirdPlace] = useState(config.thirdPlaceGame ?? false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQualifiers(stored || 4);
    setThirdPlace(config.thirdPlaceGame ?? false);
  }, [stored, config.thirdPlaceGame]);

  if (!division) {
    return (
      <div className="widget">
        <section className="card">
          <h2>No divisions yet</h2>
          <p className="hint">Add one under Divisions first.</p>
        </section>
      </div>
    );
  }

  if (!bracketStage) {
    return (
      <div className="widget">
        <section className="card">
          <h2>{division.name} has no playoff round</h2>
          <p className="hint">
            This division finishes on the pool tables. Add a knockout stage to it to play
            for a winner.
          </p>
        </section>
      </div>
    );
  }

  const teamCount = division.teams.length;
  const poolCount = division.pools.length || 1;

  // A division pinned to some pitches only gets those; otherwise the venue's.
  const fieldCount =
    division.fieldIds.length > 0 ? division.fieldIds.length : data.fields.length || 1;
  const gamesPerTeam =
    ((division.stages.find((s) => s.kind === 'pool')?.config ?? {}) as {
      gamesPerTeam?: number;
    }).gamesPerTeam ?? 0;

  const poolWindows = Math.ceil(Math.round((teamCount * gamesPerTeam) / 2) / fieldCount);
  const playoffWindows = bracketRounds(qualifiers).reduce(
    (n, games) => n + Math.ceil(games / fieldCount),
    0,
  );
  const size = nextPowerOfTwo(qualifiers);
  const byes = byeCount(qualifiers);
  const perPool = Math.floor(qualifiers / poolCount);
  const wildcards = qualifiers % poolCount;
  const tooMany = teamCount > 0 && qualifiers > teamCount;

  return (
    <div className="widget">
      {status && (
        <div className={status.ok ? 'notice ok' : 'notice error'} role="status">
          {status.text}
        </div>
      )}

      {data.divisions.length > 1 && (
        <div className="field" style={{ maxWidth: '22rem' }}>
          <label htmlFor="pl-division">Division</label>
          <select
            id="pl-division"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
          >
            {data.divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="card">
        <h2>Playoffs — {division.name}</h2>
        <p className="hint">
          {teamCount} teams in {poolCount} pool{poolCount === 1 ? '' : 's'}.
        </p>

        <div className="field" style={{ maxWidth: '16rem' }}>
          <label htmlFor="pl-count">Teams reaching the playoffs</label>
          <input
            id="pl-count"
            type="number"
            min={2}
            max={Math.max(2, teamCount || 64)}
            value={qualifiers}
            onChange={(e) => setQualifiers(Number(e.target.value))}
          />
        </div>

        {tooMany && (
          <div className="notice error">
            Only {teamCount} teams are in this division, so {qualifiers} cannot qualify.
          </div>
        )}

        <div className="checkbox-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
            />
            Play a third-place game
          </label>
        </div>

        <button
          className="primary"
          style={{ maxWidth: '16rem' }}
          disabled={busy || tooMany || qualifiers < 2}
          onClick={async () => {
            setBusy(true);
            setStatus(null);
            try {
              await api.put(`/api/setup/divisions/${division.id}/playoffs`, {
                qualifiers,
                thirdPlaceGame: thirdPlace,
              });
              setStatus({
                ok: true,
                text: 'Saved. Regenerate the schedule to apply it.',
              });
              onChanged();
            } catch (error) {
              setStatus({
                ok: false,
                text: error instanceof ApiFailure ? error.message : 'Could not save it.',
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save playoffs'}
        </button>
      </section>

      <section className="card">
        <h2>What that gives you</h2>

        <dl className="kv">
          <div>
            <dt>Bracket</dt>
            <dd>
              {size <= 2
                ? 'Straight final'
                : `${describeRound(size)} onwards — a bracket of ${size}`}
            </dd>
          </div>
          <div>
            <dt>Byes</dt>
            <dd>
              {byes === 0
                ? 'None — every qualifier plays in the first round'
                : `${byes} — the top ${byes} seed${byes === 1 ? '' : 's'} sit out the first round`}
            </dd>
          </div>
          <div>
            <dt>Games</dt>
            <dd>{qualifiers - 1 + (thirdPlace && size >= 4 ? 1 : 0)}</dd>
          </div>
          {/* The number the day is actually planned around. Minimising time
              slots is the constraint when mapping out a venue, so it has to be
              visible while the playoff size is being chosen, not afterwards. */}
          <div>
            <dt>Time slots needed</dt>
            <dd>
              <strong>{poolWindows + playoffWindows}</strong> across the day —{' '}
              {poolWindows} for pool play, {playoffWindows} for the playoffs
              {gamesPerTeam === 0 && ' (set games per team under Divisions)'}
            </dd>
          </div>
          <div>
            <dt>From each pool</dt>
            <dd>
              {perPool > 0 ? `Top ${perPool}` : 'None guaranteed'}
              {wildcards > 0 &&
                `, plus ${wildcards} wildcard${wildcards === 1 ? '' : 's'} — the best ` +
                  `${ordinal(perPool + 1)}-placed team${wildcards === 1 ? '' : 's'} across the pools`}
            </dd>
          </div>
        </dl>

        {byes > 0 && (
          <p className="hint">
            {qualifiers} does not fill a bracket evenly, so it is played as a bracket of{' '}
            {size}. The {byes} best-placed team{byes === 1 ? '' : 's'} skip
            {byes === 1 ? 's' : ''} the first round — that is the reward for finishing top.
          </p>
        )}

        {wildcards > 0 && (
          <p className="hint">
            A wildcard is decided on record across the pools: points first, then goal
            difference, then goals scored. If two are level on everything, you can re-point
            the game by hand in the schedule grid.
          </p>
        )}

        <h3>Seeding</h3>
        <p className="hint">
          Pool winners are seeded above runners-up, and the bracket keeps the top two seeds
          apart until the final.
        </p>
        <ol className="seed-list">
          {Array.from({ length: Math.min(qualifiers, 16) }, (_, i) => (
            <li key={i}>
              {seedLabel(i + 1, poolCount, perPool)}
              {i < byes && <span className="pill" style={{ marginLeft: '.4rem' }}>bye</span>}
            </li>
          ))}
          {qualifiers > 16 && <li className="muted">…and {qualifiers - 16} more.</li>}
        </ol>
      </section>
    </div>
  );
}

/**
 * Games in each knockout round, first round first.
 *
 * The first round is short by however many byes there are -- 11 qualifiers in
 * a bracket of 16 means 3 games, not 8 -- and every round after it halves the
 * field.
 */
export function bracketRounds(qualifiers: number): number[] {
  const size = nextPowerOfTwo(qualifiers);
  if (size < 2) return [];

  const rounds = [qualifiers - size / 2];
  for (let games = size / 4; games >= 1; games /= 2) rounds.push(games);
  return rounds.filter((games) => games > 0);
}

/** Which seed number belongs to which pool finish. */
function seedLabel(seed: number, poolCount: number, perPool: number): string {
  const guaranteed = perPool * poolCount;
  if (seed > guaranteed) return `Wildcard ${seed - guaranteed}`;
  const position = Math.floor((seed - 1) / poolCount) + 1;
  const pool = ((seed - 1) % poolCount) + 1;
  return `${ordinal(position)} in Pool ${String.fromCharCode(64 + pool)}`;
}

function describeRound(size: number): string {
  if (size === 4) return 'Semi-finals';
  if (size === 8) return 'Quarter-finals';
  return `Round of ${size}`;
}

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
