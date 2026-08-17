import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MatchCard from '../src/components/MatchCard.js';
import type { Fixture } from '../src/types.js';

/**
 * Two captains, two boxes.
 *
 * Both captains sign the same card, one after the other, standing next to each
 * other. The two name fields were backed by a single piece of state, so typing
 * into one filled the other: each captain watched their name appear in their
 * opposite number's box. It came right once the first team was saved, which
 * disguised it as a rendering quirk rather than what it was -- one field drawn
 * twice.
 *
 * Driven with React's own `act` and `createRoot`, following usePoll.test.tsx,
 * rather than taking a testing-library dependency this close to the tournament.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fixture: Fixture = {
  id: 'f1',
  round: null,
  kickoffAt: '2026-08-29T14:00:00.000Z',
  status: 'complete',
  homeScore: 2,
  awayScore: 1,
  homePenalties: null,
  awayPenalties: null,
  fieldId: 'fl1',
  fieldName: 'Teamwork',
  homeTeamId: 't1',
  homeTeamName: 'Milliman',
  awayTeamId: 't2',
  awayTeamName: 'Plexus',
  homeTeamJersey: 'milliman',
  awayTeamJersey: 'plexus',
  stageName: 'Pool',
  divisionName: 'Community',
  signoffCount: 0,
};

let host: HTMLDivElement;
let root: Root;

/** Type into a controlled input the way a browser does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function captainBoxes(): HTMLInputElement[] {
  return [...host.querySelectorAll<HTMLInputElement>('input[id^="cap-"]')];
}

/** Render the card and open the sign-off panel, which is behind a button. */
async function openSignoff() {
  await act(async () => {
    root.render(
      <MatchCard
        fixture={fixture}
        onLoadCards={() => undefined}
        onSubmitScore={async () => ({ sent: true })}
        onAddCard={async () => ({ sent: true })}
        onRemoveCard={async () => undefined}
        onSignOff={async () => ({ sent: true })}
      />,
    );
  });

  const finish = [...host.querySelectorAll('button')].find((b) =>
    /sign off|finish match/i.test(b.textContent ?? ''),
  )!;
  await act(async () => {
    finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('captain sign-off', () => {
  it('gives each team its own name box', async () => {
    await openSignoff();
    expect(captainBoxes()).toHaveLength(2);
  });

  it('keeps one captain’s name out of the other’s box', async () => {
    await openSignoff();
    const [homeBox, awayBox] = captainBoxes();

    type(homeBox!, 'Dana Whitfield');

    expect(homeBox!.value).toBe('Dana Whitfield');
    // The bug: this read 'Dana Whitfield' too.
    expect(awayBox!.value).toBe('');
  });

  it('lets both captains hold a different name at the same time', async () => {
    await openSignoff();
    const [homeBox, awayBox] = captainBoxes();

    type(homeBox!, 'Dana Whitfield');
    type(awayBox!, 'Sam Okafor');

    expect(homeBox!.value).toBe('Dana Whitfield');
    expect(awayBox!.value).toBe('Sam Okafor');
  });

  /**
   * Each team's button answers to its own box. With shared state, typing for
   * one captain armed the other team's button as well -- so the wrong side
   * could be signed with a name nobody had entered for it.
   */
  it('arms only the button belonging to the name being typed', async () => {
    await openSignoff();
    const [homeBox] = captainBoxes();
    const signButtons = () =>
      [...host.querySelectorAll('button')].filter((b) => /^Sign for /.test(b.textContent ?? ''));

    expect(signButtons().every((b) => b.disabled)).toBe(true);

    type(homeBox!, 'Dana Whitfield');

    const [homeSign, awaySign] = signButtons();
    expect(homeSign!.disabled).toBe(false);
    expect(awaySign!.disabled).toBe(true);
  });
});
