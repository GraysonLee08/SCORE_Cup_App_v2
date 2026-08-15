/**
 * What the coloured pips say out loud.
 *
 * The pips are two rectangles, one yellow and one red, and that is the entire
 * message: a screen reader gets nothing from them, and neither does anyone who
 * cannot tell the two colours apart. Cards are the fourth tiebreaker in this
 * tournament, so "nothing" is the wrong amount of information.
 *
 * Written as a whole sentence rather than assembled from fragments, so it
 * survives translation and reads the way somebody would say it.
 */
export function cardLabel(yellow: number, red: number): string {
  const parts: string[] = [];
  if (yellow > 0) parts.push(`${yellow} yellow card${yellow === 1 ? '' : 's'}`);
  if (red > 0) parts.push(`${red} red card${red === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'No cards';
}
