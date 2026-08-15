"""
Snap every literal font-size onto the ramp documented in DESIGN.md.

The stylesheets had accumulated 27 distinct sizes, 15 of them between 0.68 and
0.98rem -- differences of a third of a pixel that nobody chose and nobody can
see. This collapses them onto 13 steps.

Only `font-size` declarations are touched. The same numbers appear all over the
file as padding, gap and radius, where they mean something else entirely.

Every move here is under 1px at a 16px root, so nothing reflows: the point is
that the next person adding a label picks a step instead of inventing 0.83rem.

    python tools/snap-type-ramp.py
"""

import re

# old value -> ramp step. Values already on the ramp are omitted.
SNAP = {
    '0.68rem': '0.7rem',
    '0.72rem': '0.7rem',
    '0.74rem': '0.78rem',
    '0.75rem': '0.78rem',
    '0.76rem': '0.78rem',
    '0.8rem': '0.78rem',
    '0.82rem': '0.85rem',
    '0.84rem': '0.85rem',
    '0.86rem': '0.85rem',
    '0.88rem': '0.85rem',
    '0.9rem': '0.92rem',
    '0.95rem': '0.92rem',
    '0.98rem': '0.92rem',
    '1.1rem': '1.05rem',
}

DECL = re.compile(r'(font-size:\s*)([^;}\n]+)')

for path in ['apps/web/src/styles.css', 'apps/web/src/spectator.css']:
    with open(path, encoding='utf-8') as fh:
        text = fh.read()

    moves = []

    def replace(match):
        prefix, value = match.group(1), match.group(2)
        stripped = value.strip()
        if stripped in SNAP:
            moves.append((stripped, SNAP[stripped]))
            return prefix + SNAP[stripped]
        return match.group(0)

    out = DECL.sub(replace, text)

    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(out)

    print(f'{path}: {len(moves)} declarations snapped')
    for old, new in sorted(set(moves)):
        print(f'  {old:>9} -> {new} ({sum(1 for m in moves if m[0] == old)}x)')
