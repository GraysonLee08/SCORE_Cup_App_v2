import type { PublicEventResponse, PublicFixture } from '../../types.js';
import Jersey from '../Jersey.js';
import { eventDateLabel } from './eventDay.js';

/**
 * The board before the day.
 *
 * It takes the Spotlight's slot deliberately: the panel that will hold the
 * score holds the date instead. Same organ, same place on the page, so the
 * board reads as an event that has not started rather than as a scoreboard
 * that is broken -- which is what a hero of two dashes and a row of zeros
 * looks like to a captain opening the link three weeks early.
 *
 * Everything here is counted from the schedule. Nothing is predicted, and
 * nothing is stated that the tournament has not already decided.
 */
export default function Countdown({
  event,
  daysAway,
  fixtures,
  divisionCount,
  followedTeamId,
}: {
  event: PublicEventResponse['event'];
  daysAway: number;
  /** Every game at the venue, across divisions. */
  fixtures: PublicFixture[];
  divisionCount: number;
  followedTeamId: string;
}) {
  const teamIds = new Set<string>();
  for (const f of fixtures) {
    if (f.homeTeamId) teamIds.add(f.homeTeamId);
    if (f.awayTeamId) teamIds.add(f.awayTeamId);
  }
  const pitches = new Set(fixtures.map((f) => f.fieldName).filter(Boolean)).size;

  // Sorted once, then read twice: the day's shape and, if someone is following
  // a team, that team's first game.
  const byKickoff = fixtures
    .filter((f) => f.kickoffAt)
    .sort((a, b) => a.kickoffAt!.localeCompare(b.kickoffAt!));

  const mine = followedTeamId
    ? (byKickoff.find(
        (f) => f.homeTeamId === followedTeamId || f.awayTeamId === followedTeamId,
      ) ?? null)
    : null;

  const myName =
    mine && (mine.homeTeamId === followedTeamId ? mine.homeTeamName : mine.awayTeamName);

  // Only facts the schedule actually carries. A brand new event has no pitches
  // and no teams yet, and saying "0 pitches" would be worse than saying nothing.
  const facts = [
    teamIds.size > 0 && `${teamIds.size} teams`,
    divisionCount > 1 && `${divisionCount} divisions`,
    pitches > 0 && `${pitches} ${pitches === 1 ? 'pitch' : 'pitches'}`,
  ].filter((f): f is string => Boolean(f));

  return (
    <section className="glass countdown" aria-labelledby="countdown-title">
      <h2 id="countdown-title" className="countdown-date">
        {eventDateLabel(event.eventDate)}
      </h2>

      <p className="countdown-days">
        <strong>{daysAway}</strong>
        <span>{daysAway === 1 ? 'day to go' : 'days to go'}</span>
      </p>

      {facts.length > 0 && <p className="countdown-facts">{facts.join(' · ')}</p>}

      {mine ? (
        <div className="countdown-mine">
          <span className="soft tiny">{myName} play first</span>
          <span className="countdown-mine-teams">
            <Jersey jersey={mine.homeJersey} teamName={mine.homeTeamName} size={22} />
            {mine.homeTeamName} <span className="soft">v</span>{' '}
            <Jersey jersey={mine.awayJersey} teamName={mine.awayTeamName} size={22} />
            {mine.awayTeamName}
          </span>
          <span className="soft tiny">
            {kickoffLabel(mine)}
            {mine.fieldName ? ` · ${mine.fieldName}` : ''}
          </span>
        </div>
      ) : (
        <p className="countdown-hint soft tiny">
          Choose your team under Following and their first game appears here.
        </p>
      )}

      {/* It is a fundraiser, and this is the one screen with the room to ask
          without talking over a score. */}
      <a
        className="btn-donate"
        href="https://www.chicagoscores.org/donate"
        target="_blank"
        rel="noreferrer"
      >
        Donate to America SCORES
      </a>
    </section>
  );
}

function kickoffLabel(fixture: PublicFixture): string {
  if (!fixture.kickoffAt) return 'Time to be confirmed';
  return new Date(fixture.kickoffAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}
