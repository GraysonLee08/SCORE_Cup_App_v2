import { useEffect, useState } from 'react';
import type { PublicFixture } from '../../types.js';

/**
 * The match clock, derived rather than stored.
 *
 * Nobody is going to start and stop a stopwatch in this app -- referees have a
 * whistle in one hand and a phone in the other. So the clock is inferred from
 * the kickoff time and the stage's half length, and it only runs once a
 * referee has actually marked the game in progress. That means it can drift
 * from the real game by however late the kickoff was, which is why it is
 * presented as an approximation and never as the official time.
 */

export type ClockPhase =
  | { kind: 'upcoming'; minutesAway: number }
  | { kind: 'awaiting' }
  | { kind: 'first'; minute: number }
  | { kind: 'halftime' }
  | { kind: 'second'; minute: number }
  | { kind: 'overrunning'; minute: number }
  | { kind: 'final' }
  | { kind: 'unknown' };

export function matchPhase(fixture: PublicFixture, now: number): ClockPhase {
  if (fixture.status === 'complete') return { kind: 'final' };
  if (fixture.status === 'cancelled') return { kind: 'unknown' };
  if (!fixture.kickoffAt) return { kind: 'unknown' };

  const elapsed = (now - new Date(fixture.kickoffAt).getTime()) / 60_000;

  if (fixture.status !== 'in_progress') {
    // Kickoff has passed but no referee has touched it yet. Saying "0'" there
    // would be a lie about a game that may not have started.
    return elapsed < 0 ? { kind: 'upcoming', minutesAway: Math.ceil(-elapsed) } : { kind: 'awaiting' };
  }

  const half = fixture.halfMinutes;
  const interval = fixture.halftimeMinutes ?? 0;
  if (half == null) return { kind: 'unknown' };

  if (elapsed < half) return { kind: 'first', minute: Math.max(1, Math.ceil(elapsed)) };
  if (elapsed < half + interval) return { kind: 'halftime' };

  const played = elapsed - interval;
  if (played < half * 2) return { kind: 'second', minute: Math.ceil(played) };
  return { kind: 'overrunning', minute: half * 2 };
}

export function phaseLabel(phase: ClockPhase): string {
  switch (phase.kind) {
    case 'upcoming':
      // A countdown is only meaningful close to kickoff. Hours out it reads as
      // noise ("in 1470 min"), and the kickoff time itself is what people
      // want, so leave that to the caller and say nothing here.
      if (phase.minutesAway > 90) return '';
      return phase.minutesAway <= 1 ? 'Kicking off' : `in ${phase.minutesAway} min`;
    case 'awaiting':
      return 'Due now';
    case 'first':
    case 'second':
      return `${phase.minute}'`;
    case 'halftime':
      return 'Half time';
    case 'overrunning':
      return `${phase.minute}'+`;
    case 'final':
      return 'Full time';
    default:
      return '';
  }
}

/** True while the game should visibly be doing something. */
export function isRunning(phase: ClockPhase): boolean {
  return phase.kind === 'first' || phase.kind === 'second' || phase.kind === 'overrunning';
}

/**
 * A shared ticking "now". One timer for the whole page rather than one per
 * card, because a wall of scoreboards each holding its own interval is how a
 * phone left on a sideline ends up warm and flat.
 */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    // A phone in a pocket suspends timers. Catch up the moment it is looked at.
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [everyMs]);

  return now;
}
