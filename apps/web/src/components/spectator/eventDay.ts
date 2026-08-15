/**
 * Which day the tournament is on, relative to the person looking at it.
 *
 * The board was written for one afternoon and quietly assumed it was always
 * that afternoon: "The day so far", pools badged "In progress", a scoreline of
 * dashes. Two weeks out, with the link already sent to teams, that reads as a
 * broken scoreboard rather than as an event that has not started yet -- and the
 * morning after, it reads as a day that never ended.
 *
 * The comparison is by calendar day, not by instant. A tournament is on a date;
 * nobody watching thinks in milliseconds, and "15 days" must not become 14
 * because someone opened the page late at night.
 */

export type EventTense = 'before' | 'today' | 'after';

export interface EventDay {
  tense: EventTense;
  /** Whole days until the tournament: 0 on the day, negative afterwards. */
  daysAway: number;
}

export function eventDay(eventDate: string | null | undefined, now: number): EventDay {
  const when = eventDate ? new Date(eventDate) : null;

  // No date, or an unreadable one, must not invent a countdown. Falling back to
  // "today" leaves the live board exactly as it was before this existed.
  if (!when || Number.isNaN(when.getTime())) return { tense: 'today', daysAway: 0 };

  // UTC parts rather than local ones. The date is stored as the tournament's
  // own calendar day, so reading it in the viewer's timezone is what turns
  // "29 August" into the 28th for anyone sitting west of the venue.
  const day = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  const viewer = new Date(now);
  const viewerDay = Date.UTC(viewer.getFullYear(), viewer.getMonth(), viewer.getDate());

  const daysAway = Math.round((day - viewerDay) / 86_400_000);
  return {
    tense: daysAway > 0 ? 'before' : daysAway < 0 ? 'after' : 'today',
    daysAway,
  };
}

/** "Saturday 29 August" -- the way somebody would say it, not 8/29/2026. */
export function eventDateLabel(eventDate: string | null | undefined): string {
  const when = eventDate ? new Date(eventDate) : null;
  if (!when || Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * "9:00 AM" from a stored "09:00:00".
 *
 * Built on a fixed local date rather than parsed as an instant, because these
 * are wall-clock times at the venue: 9am is 9am to everyone reading the page,
 * wherever they are.
 */
export function timeOfDayLabel(hms: string | null | undefined): string {
  if (!hms) return '';
  const [h, m] = hms.split(':');
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}
