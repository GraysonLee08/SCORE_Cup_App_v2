import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FixtureList from '../src/components/FixtureList.js';
import { cardLabel } from '../src/components/cards.js';
import type { PublicFixture } from '../src/types.js';

/**
 * Cards are the fourth tiebreaker, and on screen they are two small coloured
 * rectangles. These tests exist because that failure is silent: the pips had
 * an `aria-label` all along, on a bare `<span>`, where ARIA ignores it -- so
 * the markup looked considered and announced nothing. Nothing visual breaks if
 * this regresses, which is exactly why it needs a test.
 */

function fixture(over: Partial<PublicFixture> = {}): PublicFixture {
  return {
    id: 'f1',
    round: null,
    kickoffAt: '2026-08-29T14:00:00.000Z',
    status: 'complete',
    fieldName: 'Teamwork',
    poolName: 'Poet',
    stageName: 'Pool play',
    stageKind: 'pool',
    homeTeamId: 'h',
    homeTeamName: 'Wintrust',
    awayTeamId: 'a',
    awayTeamName: 'Zebra',
    homeJersey: null,
    awayJersey: null,
    homeScore: 2,
    awayScore: 1,
    homePenalties: null,
    awayPenalties: null,
    homeCards: { yellow: 2, red: 1 },
    awayCards: { yellow: 0, red: 0 },
    refereeName: null,
    halfMinutes: 14,
    halftimeMinutes: 2,
    ...over,
  };
}

describe('cardLabel', () => {
  it('says it the way a person would', () => {
    expect(cardLabel(1, 0)).toBe('1 yellow card');
    expect(cardLabel(2, 0)).toBe('2 yellow cards');
    expect(cardLabel(0, 1)).toBe('1 red card');
    expect(cardLabel(2, 1)).toBe('2 yellow cards, 1 red card');
  });

  it('has something to say when there are none', () => {
    expect(cardLabel(0, 0)).toBe('No cards');
  });
});

describe('card pips', () => {
  it('carries a role, so its label is not ignored', () => {
    const html = renderToStaticMarkup(<FixtureList fixtures={[fixture()]} />);
    const host = document.createElement('div');
    host.innerHTML = html;

    const pips = host.querySelector('.pips')!;
    expect(pips).toBeTruthy();
    // Without the role, a screen reader announces nothing here at all.
    expect(pips.getAttribute('role')).toBe('img');
    expect(pips.getAttribute('aria-label')).toBe('2 yellow cards, 1 red card');
  });

  it('renders nothing at all for a clean team', () => {
    const html = renderToStaticMarkup(
      <FixtureList fixtures={[fixture({ homeCards: { yellow: 0, red: 0 } })]} />,
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    // The away side is also clean in this fixture, so neither set renders.
    expect(host.querySelectorAll('.pips')).toHaveLength(0);
  });
});
