import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StandingsTable from '../src/components/StandingsTable.js';
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

function render(pool: Partial<PublicPoolTable> = {}) {
  const html = renderToStaticMarkup(
    <StandingsTable
      pool={{
        poolId: 'p1',
        poolName: 'Athlete',
        complete: false,
        rows: [row()],
        penaltyPoints: { yellow: 1, red: 2 },
        ...pool,
      }}
    />,
  );
  const host = document.createElement('div');
  host.innerHTML = html;
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
      GF: '2',
      GA: '0',
      Cards: '3', // one yellow (1) plus one red (2)
      Pts: '4', // win (3) plus the clean-sheet bonus (1)
    });
  });

  it('states the weighting it was given rather than assuming one', () => {
    const flat = renderToStaticMarkup(
      <StandingsTable
        pool={{
          poolId: 'p1',
          poolName: 'Athlete',
          complete: false,
          rows: [row()],
          penaltyPoints: { yellow: 1, red: 1 },
        }}
      />,
    );
    expect(flat).toContain('Every card counts 1.');

    const weighted = renderToStaticMarkup(
      <StandingsTable
        pool={{
          poolId: 'p1',
          poolName: 'Athlete',
          complete: false,
          rows: [row()],
          penaltyPoints: { yellow: 1, red: 2 },
        }}
      />,
    );
    expect(weighted).toContain('A yellow counts 1, a red counts 2.');
  });
});
