import { describe, it, expect } from 'vitest';
import {
  eventDay,
  eventDateLabel,
  timeOfDayLabel,
} from '../src/components/spectator/eventDay.js';

/**
 * The board changes what it says based on this, so the tests are about the two
 * ways date maths goes wrong in public: counting in milliseconds instead of
 * days, and reading the tournament's calendar date in the viewer's timezone.
 */

// Midnight in Chicago on the day of the 2026 tournament, as stored.
const EVENT = '2026-08-29T05:00:00.000Z';

/** A local wall-clock instant, so "late at night" means late where the viewer is. */
const localTime = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('eventDay', () => {
  it('counts whole days ahead of the tournament', () => {
    expect(eventDay(EVENT, localTime(2026, 8, 14))).toEqual({ tense: 'before', daysAway: 15 });
  });

  it('is on the day itself, not the hour', () => {
    // First thing in the morning and last thing at night are both "today":
    // the board is live all day, and it must not flip tense at kickoff or dusk.
    expect(eventDay(EVENT, localTime(2026, 8, 29, 6, 30))).toEqual({
      tense: 'today',
      daysAway: 0,
    });
    expect(eventDay(EVENT, localTime(2026, 8, 29, 23, 45))).toEqual({
      tense: 'today',
      daysAway: 0,
    });
  });

  it('knows the morning after', () => {
    expect(eventDay(EVENT, localTime(2026, 8, 30, 7))).toEqual({ tense: 'after', daysAway: -1 });
  });

  it('does not lose a day to a late-night viewer', () => {
    // 11:50pm the night before is still one day away, not zero. Counting in
    // elapsed milliseconds would round this to today.
    expect(eventDay(EVENT, localTime(2026, 8, 28, 23, 50))).toEqual({
      tense: 'before',
      daysAway: 1,
    });
  });

  it('falls back to the live board rather than inventing a countdown', () => {
    expect(eventDay(null, localTime(2026, 8, 14))).toEqual({ tense: 'today', daysAway: 0 });
    expect(eventDay('not a date', localTime(2026, 8, 14))).toEqual({
      tense: 'today',
      daysAway: 0,
    });
  });
});

describe('eventDateLabel', () => {
  it('names the tournament day, said the way a person would say it', () => {
    const label = eventDateLabel(EVENT);
    expect(label).toContain('29');
    expect(label).toContain('August');
    // The 29th is a Saturday. If this reads Friday, the label is being
    // rendered in the viewer's timezone rather than the tournament's day.
    expect(label).toContain('Saturday');
  });

  it('says nothing when there is no date', () => {
    expect(eventDateLabel(null)).toBe('');
    expect(eventDateLabel('not a date')).toBe('');
  });
});

describe('timeOfDayLabel', () => {
  it('reads a stored wall-clock time', () => {
    expect(timeOfDayLabel('09:00:00')).toMatch(/9[:.]00/);
    expect(timeOfDayLabel('17:00:00')).toMatch(/5[:.]00/);
  });

  it('says nothing when there is no time', () => {
    expect(timeOfDayLabel(null)).toBe('');
    expect(timeOfDayLabel('')).toBe('');
    expect(timeOfDayLabel('nonsense')).toBe('');
  });
});
