import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JERSEYS } from '../src/components/Jersey.js';

/**
 * The kit list and the kit files have to agree.
 *
 * They are maintained in two places by necessity -- the images are static
 * assets, the list is what the admin picker offers -- and the two failure
 * modes are silent. A kit in the list with no file renders a broken image on
 * the public board; a file nobody lists can never be chosen, so a team quietly
 * has no shirt. Next year's sponsors arrive as a fresh set of artwork, which
 * is exactly when this drifts.
 */
const jerseyDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../public/jerseys',
);

const onDisk = readdirSync(jerseyDir)
  .filter((f) => f.endsWith('.webp'))
  .map((f) => f.replace(/\.webp$/, ''))
  .sort();

describe('team kits', () => {
  it('offers every kit that exists, and every kit it offers exists', () => {
    expect([...JERSEYS].sort()).toEqual(onDisk);
  });

  it('covers all 19 teams in the 2026 tournament', () => {
    expect(onDisk).toHaveLength(19);
  });

  /** The picker shows these raw, so an unsorted list reads as disorganised. */
  it('is listed in alphabetical order', () => {
    expect([...JERSEYS]).toEqual([...JERSEYS].sort());
  });

  /**
   * Names go straight into a URL and into a column validated by a regex on the
   * API, so anything outside this alphabet cannot round-trip.
   */
  it('uses names that survive a URL and the API validator', () => {
    for (const kit of JERSEYS) {
      expect(kit, kit).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
