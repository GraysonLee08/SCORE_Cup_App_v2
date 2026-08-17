import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MatchCard from '../src/components/MatchCard.js';
import type { Fixture } from '../src/types.js';

/**
 * Kits on the referee's card.
 *
 * A referee is looking at two sets of shirts and a phone, and has to decide
 * which side of the card is which. The kit is what makes that immediate --
 * particularly for the two JPMorganChase teams, who share a name and play in
 * different colours.
 *
 * Tested rather than eyeballed because the referee view is behind a sign-in,
 * so nobody sees this rendered without a referee account in hand.
 */
function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    id: 'f1',
    round: null,
    kickoffAt: '2026-08-29T14:00:00.000Z',
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    fieldId: 'fl1',
    fieldName: 'Teamwork',
    homeTeamId: 't1',
    homeTeamName: 'JPMorganChase',
    awayTeamId: 't2',
    awayTeamName: 'Milliman',
    homeTeamJersey: 'jpmorganchase-blue',
    awayTeamJersey: 'milliman',
    stageName: 'Pool',
    divisionName: 'Community',
    signoffCount: 0,
    ...over,
  };
}

function render(over: Partial<Fixture> = {}) {
  const html = renderToStaticMarkup(
    <MatchCard
      fixture={fixture(over)}
      onLoadCards={() => undefined}
      onSubmitScore={async () => ({ sent: true })}
      onAddCard={async () => ({ sent: true })}
      onRemoveCard={async () => undefined}
      onSignOff={async () => ({ sent: true })}
    />,
  );
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
}

describe('kits on the referee card', () => {
  it('shows each side the shirt it is playing in', () => {
    const host = render();
    const kits = [...host.querySelectorAll('img.jersey')].map((i) => i.getAttribute('src'));

    expect(kits).toEqual(['/jerseys/jpmorganchase-blue.webp', '/jerseys/milliman.webp']);
  });

  /**
   * The invariant worth protecting. With a band on one side only, that team's
   * name drops half a shirt below the other -- on a card read at arm's length,
   * mid-game, two names at different heights is exactly the confusion the kits
   * were added to remove.
   */
  it('reserves the same band on both sides when only one kit is known', () => {
    const host = render({ awayTeamJersey: null });

    expect(host.querySelectorAll('.side .kit')).toHaveLength(2);
    expect(host.querySelectorAll('img.jersey')).toHaveLength(1);
  });

  it('gives up the band entirely when neither kit is known', () => {
    const host = render({ homeTeamJersey: null, awayTeamJersey: null });

    // An empty strip above both names would be a row of missing information
    // presented as though it were information.
    expect(host.querySelectorAll('.side .kit')).toHaveLength(0);
    expect(host.querySelectorAll('img.jersey')).toHaveLength(0);
  });

  it('still names both teams, so the kit is a second cue and not the only one', () => {
    const host = render();
    const names = [...host.querySelectorAll('.side .name')].map((n) => n.textContent);

    expect(names).toEqual(['JPMorganChase', 'Milliman']);
  });
});
