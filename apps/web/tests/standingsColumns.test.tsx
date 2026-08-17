import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StandingsTable, {
  sharedCardRule,
  sharedShutoutRule,
} from '../src/components/StandingsTable.js';
import type { PublicPoolTable, StandingsRow } from '../src/types.js';

/**
 * The standings table lines up with its own headings.
 *
 * Added after a Cards column was introduced by editing the goals-against cell
 * rather than adding a new one. Every column from GA rightwards shifted by one,
 * so the heading "Cards" sat above the points and "GA" above the card points --
 * a table that was wrong in a way that still looked like a table. Nothing
 * caught it, because the numbers were all real numbers in plausible places.
 */

function row(over: Partial<StandingsRow> = {}): StandingsRow {
  return {
    teamId: 't1',
    teamName: 'Balyasny',
    played: 1,
    won: 1,
    drawn: 0,
    lost: 0,
    goalsFor: 2,
    goalsAgainst: 0,
    goalDifference: 2,
    shutoutWins: 1,
    yellowCards: 1,
    redCards: 1,
    penaltyPoints: 3,
    adjustmentPoints: 0,
    points: 4,
    rank: 1,
    needsManualTiebreak: false,
    ...over,
  };
}

function pool(over: Partial<PublicPoolTable> = {}): PublicPoolTable {
  return {
    poolId: 'p1',
    poolName: 'Athlete',
    complete: false,
    rows: [row()],
    penaltyPoints: { yellow: 1, red: 2 },
    shutoutWinBonus: 1,
    ...over,
  };
}

function render(pool: Partial<PublicPoolTable> = {}) {
  const html = renderToStaticMarkup(
    <StandingsTable
      pool={{
        poolId: 'p1',
        poolName: 'Athlete',
        complete: false,
        rows: [row()],
        penaltyPoints: { yellow: 1, red: 2 },
        shutoutWinBonus: 1,
        ...pool,
      }}
    />,
  );
  const host = document.createElement('div');
  host.innerHTML = html;

  // Drop screen-reader-only text before reading the cells. This test is about
  // what a sighted reader sees lining up under each heading; the spoken
  // equivalents ("3 card points, 1 yellow card…") live in the same cells and
  // would otherwise look like a column full of prose.
  for (const hidden of host.querySelectorAll('.sr-only')) hidden.remove();

  const table = host.querySelector('table.standings')!;
  return {
    headers: [...table.querySelectorAll('thead th')].map((t) => t.textContent!.trim()),
    cells: [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent!.trim()),
    ),
  };
}

describe('standings columns', () => {
  it('gives every heading exactly one cell', () => {
    const { headers, cells } = render();
    for (const rowCells of cells) {
      expect(rowCells).toHaveLength(headers.length);
    }
  });

  /**
   * The check that actually matters: not just that the counts agree, but that
   * each number is under the heading that describes it. A shifted table has
   * matching counts the moment a column is dropped as well as added.
   */
  it('puts each number under its own heading', () => {
    const { headers, cells } = render();
    const byHeading = Object.fromEntries(headers.map((h, i) => [h, cells[0]![i]]));

    expect(byHeading).toMatchObject({
      '#': '1',
      Team: 'Balyasny',
      P: '1',
      W: '1',
      D: '0',
      L: '0',
      SH: '1', // the 2-0 win
      GF: '2',
      GA: '0',
      FP: '3', // fair play: one yellow (1) plus one red (2)
      Pts: '4', // win (3) plus the clean-sheet bonus (1)
    });
  });

  /**
   * SH exists to account for the gap between W and Pts, so the case worth
   * pinning is the one where the two disagree: two wins showing eight points.
   * If SH ever stops being rendered, this is what notices.
   */
  it('accounts for points that W alone does not explain', () => {
    const { headers, cells } = render({
      rows: [row({ played: 3, won: 2, lost: 1, goalsFor: 3, goalsAgainst: 3, shutoutWins: 2, points: 8 })],
    });
    const byHeading = Object.fromEntries(headers.map((h, i) => [h, cells[0]![i]]));

    expect(byHeading.W).toBe('2');
    expect(byHeading.Pts).toBe('8');
    // Two wins reads as six. The other two points are the two clean sheets,
    // and GA of 3 gives no hint of them.
    expect(byHeading.SH).toBe('2');
  });

  /**
   * The rule moved out of the table and is now written once for every pool in
   * the rail, so the requirement moved with it: still state the weighting that
   * was configured, never a weighting that was assumed.
   */
  it('states the weighting it was given rather than assuming one', () => {
    expect(sharedCardRule([pool({ penaltyPoints: { yellow: 1, red: 1 } })])).toContain(
      'every card counts 1.',
    );
    expect(sharedCardRule([pool({ penaltyPoints: { yellow: 1, red: 2 } })])).toContain(
      'a yellow counts 1, a red counts 2.',
    );
  });

  it('will not put one pool’s weighting under another pool’s table', () => {
    // Saying "a yellow counts 1" beneath a pool that weights it 2 would be a
    // guess printed as a fact, so with pools that disagree the numbers go.
    const mixed = sharedCardRule([
      pool({ poolId: 'a', penaltyPoints: { yellow: 1, red: 2 } }),
      pool({ poolId: 'b', penaltyPoints: { yellow: 2, red: 4 } }),
    ]);
    expect(mixed).toContain('cards count against a team.');
    expect(mixed).not.toMatch(/counts \d/);

    // Agreeing pools are the normal case and do get the numbers.
    const agreed = sharedCardRule([
      pool({ poolId: 'a', penaltyPoints: { yellow: 1, red: 2 } }),
      pool({ poolId: 'b', penaltyPoints: { yellow: 1, red: 2 } }),
    ]);
    expect(agreed).toContain('a yellow counts 1, a red counts 2.');
  });

  describe('the shutout rule', () => {
    it('states the bonus it was given rather than assuming one', () => {
      expect(sharedShutoutRule([pool({ shutoutWinBonus: 1 })])).toContain('adds 1 point to the win');
      expect(sharedShutoutRule([pool({ shutoutWinBonus: 2 })])).toContain('adds 2 points to the win');
    });

    it('drops the bonus sentence when the tournament is not running the rule', () => {
      const off = sharedShutoutRule([pool({ shutoutWinBonus: 0 })]);
      expect(off).toBe('SH counts wins to nil.');
      expect(off).not.toMatch(/adds/);
    });

    it('will not put one pool’s bonus under another pool’s table', () => {
      const mixed = sharedShutoutRule([
        pool({ poolId: 'a', shutoutWinBonus: 1 }),
        pool({ poolId: 'b', shutoutWinBonus: 2 }),
      ]);
      expect(mixed).not.toMatch(/adds \d/);
    });
  });
});
