/**
 * A team's kit, as a small icon.
 *
 * Chosen over a colour swatch because the real shirts carry more than a
 * colour: two JPMorganChase sides play in different divisions in orange and
 * royal blue, and three teams are in some shade of navy that a dot would make
 * indistinguishable. A volunteer looking for "the team in the green shirt" is
 * matching the shirt, so show the shirt.
 *
 * Renders nothing when a team has no kit on file, rather than a placeholder --
 * an empty space reads as "not known", while a grey shirt reads as "they are
 * wearing grey".
 */
export const JERSEYS = [
  'abbvie',
  'abn-amro',
  'aon',
  'balyasny',
  'cdw',
  'cisco',
  'cornerstone',
  'drw',
  'elephant-and-castle',
  'imc',
  'jpmorganchase-blue',
  'jpmorganchase-orange',
  'mazek-law',
  'milliman',
  'oncourse',
  'plexus',
  'pwc',
  'wintrust',
  'zebra',
] as const;

export default function Jersey({
  jersey,
  teamName,
  size = 22,
}: {
  jersey: string | null | undefined;
  teamName?: string;
  size?: number;
}) {
  if (!jersey) return null;

  return (
    <img
      className="jersey"
      src={`/jerseys/${jersey}.webp`}
      // The team name is already beside it in every use, so repeating it here
      // would have a screen reader say everything twice.
      alt=""
      aria-hidden="true"
      title={teamName}
      // Height drives it and the aspect ratio supplies the width, so the box
      // has a size before the image arrives. Not lazy: they are ~7KB each, and
      // a lazily-loaded image with no intrinsic size never enters the viewport
      // that would trigger it to load.
      style={{ height: size }}
    />
  );
}
