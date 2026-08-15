"""
Build the self-hosted web fonts.

Two jobs, and the second one is the reason this script exists rather than a
one-line woff2 conversion.

**Subset to Latin.** Poppins ships Devanagari -- 1059 glyphs, most of which this
tournament will never render. Cutting to the Latin range and compressing to
woff2 takes each face from ~155KB to ~15KB, which matters on a field connection.

**Make the digits tabular.** Poppins has no `tnum` feature and its digits are
proportional: a "1" is roughly half the width of a "0". The stylesheet asks for
`font-variant-numeric: tabular-nums` in eleven places and has been getting it
free from the system stack. Left alone, adopting Poppins would silently make
every score, standings column and stat tile shuffle sideways as results come in
-- a 9 becoming a 10 would move the column, on the one screen everyone is
watching.

Rather than fight it in CSS, the digits are made tabular in the file: every
digit gets the widest digit's advance and is re-centred inside it. This applies
to *all* digits rather than adding an alternate `tnum` set, which is the right
trade here -- nearly every number in this app is data (scores, times, points),
and there is no body copy where proportional figures would read better. The CSS
declaration stays as documentation of intent and simply becomes a no-op.

Lubalin is left alone: it is the display face, and per DESIGN.md it never sets a
number that can change.

    python tools/build-fonts.py

Sources are `fonts/*.ttf` and the Lubalin file in the web app's assets; output
is woff2 in `apps/web/public/fonts/`.
"""

import os

from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

# The Google Fonts "latin" range: Latin-1 plus the typographic punctuation the
# copy actually uses -- the en dash that means "no score entered", curly
# quotes, the ellipsis.
UNICODES = (
    list(range(0x0000, 0x0100))
    + [0x0131, 0x0152, 0x0153, 0x02BB, 0x02BC, 0x02C6, 0x02DA, 0x02DC]
    + list(range(0x2000, 0x2070))
    + [0x2074, 0x20AC, 0x2122, 0x2191, 0x2193, 0x2212, 0x2215, 0xFEFF, 0xFFFD]
)

SRC_DIR = 'fonts'
OUT_DIR = os.path.join('apps', 'web', 'public', 'fonts')

# (source file, output name, make digits tabular)
FACES = [
    (os.path.join(SRC_DIR, 'Poppins-Regular.ttf'), 'poppins-400.woff2', True),
    (os.path.join(SRC_DIR, 'Poppins-Italic.ttf'), 'poppins-400-italic.woff2', True),
    (os.path.join(SRC_DIR, 'Poppins-SemiBold.ttf'), 'poppins-600.woff2', True),
    (os.path.join(SRC_DIR, 'Poppins-Bold.ttf'), 'poppins-700.woff2', True),
    (os.path.join(SRC_DIR, 'Poppins-ExtraBold.ttf'), 'poppins-800.woff2', True),
    (
        os.path.join('apps', 'web', 'src', 'assets', 'Lubalin Graph Regular.ttf'),
        'lubalin-graph-400.woff2',
        False,
    ),
]

DIGITS = '0123456789'


def make_digits_tabular(font: TTFont) -> int:
    """Give every digit the widest digit's advance, centred. Returns that width."""
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    glyf = font['glyf']

    names = [cmap[ord(d)] for d in DIGITS if ord(d) in cmap]
    target = max(hmtx[n][0] for n in names)

    for name in names:
        width, lsb = hmtx[name]
        shift = round((target - width) / 2)
        glyph = glyf[name]

        if shift and glyph.numberOfContours != 0:
            if glyph.isComposite():
                for component in glyph.components:
                    x, y = component.x, component.y
                    component.x = x + shift
            else:
                glyph.coordinates.translate((shift, 0))
            glyph.recalcBounds(glyf)

        hmtx[name] = (target, lsb + shift)

    return target


def build(src: str, out_name: str, tabular: bool) -> None:
    font = TTFont(src)

    options = Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.recalc_bounds = True

    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)

    note = ''
    if tabular:
        note = f' · digits fixed at {make_digits_tabular(font)}/1000'

    font.flavor = 'woff2'
    dest = os.path.join(OUT_DIR, out_name)
    font.save(dest)
    font.close()

    before = os.path.getsize(src) / 1024
    after = os.path.getsize(dest) / 1024
    print(f'{out_name:<26} {before:6.0f}KB -> {after:5.1f}KB{note}')


os.makedirs(OUT_DIR, exist_ok=True)
for src, out_name, tabular in FACES:
    build(src, out_name, tabular)
