import { describe, it, expect } from 'vitest';
import { saveOutcome } from '../src/components/admin/ResultsPanel.js';

/**
 * Scores are saved one game at a time, so "it failed" was never the whole
 * truth. This sentence is the only thing standing between a director at the
 * scores table and a wrong belief about the day's record -- so it is tested
 * like a calculation, not like copy.
 */

describe('saveOutcome', () => {
  it('reports a clean save plainly', () => {
    expect(saveOutcome({ savedCount: 3, failed: [], attempted: 3, sessionLost: false })).toEqual({
      ok: true,
      text: 'Saved 3 games.',
    });
    expect(saveOutcome({ savedCount: 1, failed: [], attempted: 1, sessionLost: false }).text).toBe(
      'Saved 1 game.',
    );
  });

  it('says how much landed when only some of it did', () => {
    const out = saveOutcome({
      savedCount: 4,
      failed: ['PwC v Cisco'],
      attempted: 5,
      sessionLost: false,
    });
    expect(out.ok).toBe(false);
    // The four that saved must be stated. Re-entering them is the failure mode.
    expect(out.text).toContain('Saved 4.');
    expect(out.text).toContain('PwC v Cisco');
    expect(out.text).toContain('It is still here');
  });

  it('does not claim a save when nothing saved', () => {
    const out = saveOutcome({
      savedCount: 0,
      failed: ['Aon v Milliman', 'DRW v Zebra'],
      attempted: 2,
      sessionLost: false,
    });
    expect(out.text).not.toContain('Saved');
    expect(out.text).toContain('2 could not be saved');
    expect(out.text).toContain('They are still here');
  });

  it('counts everything left over when a lost session stopped the run early', () => {
    // Ten attempted, three written, the fourth 401s and the last six are never
    // tried. Six plus the one that failed are still waiting: seven, not one.
    const out = saveOutcome({
      savedCount: 3,
      failed: ['Aon v Milliman'],
      attempted: 10,
      sessionLost: true,
    });
    expect(out.text).toContain('Saved 3.');
    expect(out.text).toContain('session has expired');
    expect(out.text).toContain('remaining 7');
  });
});
