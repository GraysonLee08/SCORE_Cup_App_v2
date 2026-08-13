"""
Lift the jerseys off their cream backdrop.

Deliberately a flood fill from the border rather than a colour key. Six of the
fifteen shirts have white or near-white sleeves and every one of them has white
lettering; keying on "roughly cream" globally would punch holes straight
through those. Only background that is *connected to the edge* is removed.

Alpha is graded by how far a pixel sits from the backdrop colour, so the
anti-aliased rim of the shirt fades out instead of leaving a hard cream fringe
that shows up as a halo once the icon is on a dark background.
"""

import glob
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

# Anything within NEAR of the sampled backdrop is definitely backdrop; beyond
# FAR is definitely shirt. Between the two, alpha ramps.
NEAR, FAR = 5.0, 20.0
OUT = sys.argv[1] if len(sys.argv) > 1 else 'cut'


def backdrop_colour(rgb: np.ndarray) -> np.ndarray:
    edges = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    return np.median(edges, axis=0)


def outside_mask(dist: np.ndarray) -> np.ndarray:
    """Backdrop-coloured pixels reachable from the border."""
    h, w = dist.shape
    candidate = dist < FAR
    seen = np.zeros((h, w), bool)
    queue = deque()

    for y, x in (
        [(0, x) for x in range(w)]
        + [(h - 1, x) for x in range(w)]
        + [(y, 0) for y in range(h)]
        + [(y, w - 1) for y in range(h)]
    ):
        if candidate[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and candidate[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def cut(path: str, out_dir: str) -> tuple[str, tuple[int, int]]:
    im = Image.open(path).convert('RGB')
    rgb = np.asarray(im).astype(np.float32)

    bg = backdrop_colour(rgb)
    dist = np.abs(rgb - bg).max(axis=2)

    outside = outside_mask(dist)

    alpha = np.full(dist.shape, 255.0)
    ramp = np.clip((dist - NEAR) / (FAR - NEAR), 0.0, 1.0) * 255.0
    alpha[outside] = ramp[outside]

    rgba = np.dstack([rgb, alpha]).astype(np.uint8)
    cutout = Image.fromarray(rgba, 'RGBA')

    box = cutout.getbbox()
    if box:
        cutout = cutout.crop(box)

    name = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(out_dir, f'{name}.png')
    cutout.save(dest)
    return dest, cutout.size


os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob('raw/*.png')):
    dest, size = cut(f, OUT)
    print(dest, size)
