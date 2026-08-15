import { describe, it, expect } from 'vitest';
import { resolveSunMode } from '../src/components/spectator/sunMode.js';

/**
 * The rule this protects: a choice the visitor made outranks the one their
 * device implies, in both directions. Somebody who turned bright sun on at 1pm
 * must not find it off after a refresh -- and somebody who turned it off on a
 * device that asks for high contrast must not find it back on.
 */

describe('resolveSunMode', () => {
  it('follows the device when nobody has chosen', () => {
    expect(resolveSunMode(null, true)).toBe(true);
    expect(resolveSunMode(null, false)).toBe(false);
  });

  it('lets a stored choice win over the device, both ways', () => {
    expect(resolveSunMode('1', false)).toBe(true);
    expect(resolveSunMode('0', true)).toBe(false);
  });

  it('treats a value it does not recognise as no choice at all', () => {
    // An older or corrupted key must not silently pin the board to one mode.
    expect(resolveSunMode('yes', true)).toBe(true);
    expect(resolveSunMode('', true)).toBe(true);
  });
});
