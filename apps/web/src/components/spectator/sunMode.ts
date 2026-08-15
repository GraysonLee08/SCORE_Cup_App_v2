/**
 * Bright-sun mode: whether the board drops its glass for opaque panels.
 *
 * The board is dark, translucent and blurred, and the one place it is
 * guaranteed to be read is a field in August. Translucency and blur both spend
 * contrast to buy depth, and sunlight on the screen adds the same luminance to
 * a panel and to the text on it -- which flattens exactly the mid-tones this
 * theme leans on. Ratios measured indoors say nothing about that.
 *
 * So this is an escape hatch rather than a preference: one tap, and the
 * material changes. The colours, the layout and the type do not.
 */

export const SUN_KEY = 'scorescup.bright-sun';

/**
 * A choice the visitor made outranks the one their device implies, and it
 * outranks it permanently -- somebody who turned this on at 1pm should not
 * find it off again after a refresh. With no stored choice, a device already
 * asking for more contrast gets it without being told to look for a button.
 */
export function resolveSunMode(stored: string | null, prefersMoreContrast: boolean): boolean {
  if (stored === '1') return true;
  if (stored === '0') return false;
  return prefersMoreContrast;
}

/** The starting state, read once at mount. Safe where matchMedia is absent. */
export function initialSunMode(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SUN_KEY);
  } catch {
    // Private-mode storage failures must not stop the board rendering.
  }
  const prefers = window.matchMedia?.('(prefers-contrast: more)').matches ?? false;
  return resolveSunMode(stored, prefers);
}
