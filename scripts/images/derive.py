#!/usr/bin/env python3
"""Responsive derivatives for the images under web/assets/images/generated.

For every JPEG it writes <name>.<width>.avif next to it, at the widths its kind needs (never
wider than the source). The frontend's UI.picture() points an AVIF <source> srcset at these
files; browsers without AVIF use the JPEG. Run after adding or replacing an image:

    python3 scripts/images/derive.py
    python3 scripts/images/derive.py --cover-masters DIR   # also a sharp 1120w cover from originals

--cover-masters takes a folder of the original portrait covers (e.g. 1120x1400) and matches each
one to generated/<slug>/cover.jpg by appearance, so the opening of a journey page can use a
larger, sharper version until its own hero image exists. Originals are never copied into the repo.
"""
import argparse
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'assets', 'images', 'generated')

# widths per kind of image (keep in step with UI.picture, ingest.py and UT-CONTENT-IMG-001)
WIDTHS = {
    'cover': [480, 720],
    'card': [480, 720],
    'hero': [960, 1536],
    'scene-1': [960, 1536],
    'scene-2': [960, 1536],
    'scene-3': [600, 960],
    'fork': [600, 1024],
    'ending': [600],
    'home': [960, 1600],
}
AVIF_Q = 52
AVIF_Q_LARGE = 46  # 1000px and wider: the openings, where bytes matter most for LCP


def kind_of(name):
    base = os.path.splitext(name)[0]
    if base.startswith('card-'):
        return 'card'
    if base == 'hero-taoyuan':
        return 'home'
    if base.startswith('hero-taoyuan'):
        return None  # the 960/1600 JPEGs are the fallbacks for the home opening
    return base if base in WIDTHS else None


def save(img, path_base, width):
    w = min(width, img.width)
    h = round(img.height * w / img.width)
    out = img if w == img.width else img.resize((w, h), Image.LANCZOS)
    # (scene slots keep a small JPEG fallback; their large AVIFs come from the originals via ingest.py)
    out.save(f'{path_base}.{width}.avif', 'AVIF', quality=AVIF_Q_LARGE if width >= 1000 else AVIF_Q)


def match_grade(master, graded):
    """Carry the cover's colour grade over to the original: fit an affine colour transform from
    the original (at the cover's size) to the graded cover and apply it at full size."""
    try:
        import numpy as np
    except ImportError:
        return master
    small = np.asarray(master.resize(graded.size, Image.LANCZOS), dtype=np.float64).reshape(-1, 3)
    target = np.asarray(graded, dtype=np.float64).reshape(-1, 3)
    x = np.hstack([small, np.ones((small.shape[0], 1))])
    m, *_ = np.linalg.lstsq(x, target, rcond=None)  # 4x3
    full = np.asarray(master, dtype=np.float64)
    h, w, _ = full.shape
    out = np.hstack([full.reshape(-1, 3), np.ones((h * w, 1))]) @ m
    return Image.fromarray(np.clip(out, 0, 255).reshape(h, w, 3).astype(np.uint8))


def fingerprint(img):
    return ImageOps.fit(img.convert('L'), (40, 50)).tobytes()


def distance(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cover-masters', help='folder of original covers to derive a sharp 1120w version from')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    made = 0
    covers = []
    for dirpath, _, files in os.walk(ROOT):
        for name in sorted(files):
            if not name.lower().endswith('.jpg') or name.count('.') > 1:
                continue
            kind = kind_of(name)
            if not kind:
                continue
            src = os.path.join(dirpath, name)
            base = os.path.splitext(src)[0]
            if kind in ('cover', 'card'):
                covers.append(src)
            img = Image.open(src).convert('RGB')
            for w in WIDTHS[kind]:
                if kind not in ('cover', 'card', 'home') and w > img.width:
                    continue  # made from the original by ingest.py; never from the smaller fallback
                target = f'{base}.{w}.avif'
                if not args.force and os.path.exists(target) and os.path.getmtime(target) >= os.path.getmtime(src):
                    continue
                save(img, base, w)
                made += 1

    if args.cover_masters:
        masters = []
        for name in sorted(os.listdir(args.cover_masters)):
            if name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                p = os.path.join(args.cover_masters, name)
                masters.append((p, fingerprint(Image.open(p))))
        for src in covers:
            fp = fingerprint(Image.open(src))
            best = min(masters, key=lambda m: distance(fp, m[1]), default=None)
            if not best:
                continue
            score = distance(fp, best[1]) / len(fp)
            if score > 18:  # no convincing original for this cover
                continue
            master = ImageOps.fit(Image.open(best[0]).convert('RGB'), (1120, 1400), Image.LANCZOS)
            master = match_grade(master, Image.open(src).convert('RGB'))
            save(master, os.path.splitext(src)[0], 1120)
            made += 1
    print(f'derived {made} image sets')


if __name__ == '__main__':
    sys.exit(main())
