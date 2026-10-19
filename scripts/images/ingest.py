#!/usr/bin/env python3
"""Bring a folder of generated journey images into the site.

    python3 scripts/images/ingest.py SRC [--slugs a,b] [--skip slug/slot,...] [--road]

SRC holds one folder per journey slug with any of hero, scene-1, scene-2, scene-3, fork, ending,
texture and cover (.jpg), and optionally road/ with the Ticket Road images. Each image gets the
site's restrained grade (a little less saturation, lifted cool shadows, fine grain: the same pass
the covers had), then is written under web/assets/images/generated/<slug>/ as a JPEG fallback at
the width its slot is shown at, plus the AVIF sizes the pages ask for, made from the full-size
original. Metadata is stripped. With --road the Ticket Road set is cropped to the shapes its pages
use and written under generated/road/. Each journey's scene file is then pointed at the slots that
exist. Originals are never copied into the repo.
"""
import argparse
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'assets', 'images', 'generated')

# The covers' grade, fitted from their originals: an affine colour transform (rows R, G, B, 1).
GRADE = np.array([
    [0.7784, 0.0447, 0.0335],
    [0.0995, 0.8257, 0.1221],
    [0.0165, 0.0205, 0.7131],
    [10.806, 12.244, 17.360],
])
GRAIN = 1.8  # luma noise, in 8-bit levels

# slot: (JPEG fallback width, AVIF widths). Keep in step with UI.picture and UT-CONTENT-IMG-001.
SLOTS = {
    'hero': (960, [960, 1536]),
    'scene-1': (960, [960, 1536]),
    'scene-2': (960, [960, 1536]),
    'scene-3': (600, [600, 960]),
    'fork': (600, [600, 1024]),
    'ending': (600, [600]),
    'texture': (640, []),  # a CSS background at low opacity: JPEG only, soft is fine
}
COVER = ((720, 900), [480, 720, 1120])

# Ticket Road: name -> (crop aspect w/h, vertical centre of the crop, JPEG width, AVIF widths, grade)
ROAD = {
    'station-hall-night': (16 / 5, 0.52, 960, [960, 1536], True),
    'station-hall-dawn': (16 / 5, 0.52, 960, [960, 1536], True),
    'station-hall-night-phone': (4 / 5, 0.5, 600, [600, 1024], True),
    'station-hall-dawn-phone': (4 / 5, 0.5, 600, [600, 1024], True),
    'rubbing-stone': (8 / 3, 0.5, 960, [960, 1536], False),
}
BAND = (1200 / 261, 0.5, 600, [600, 1200], True)  # realm-band-*: the middle third as a 4.6:1 strip


def seed(key):
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def grade(img, key, grain=GRAIN):
    a = np.asarray(img.convert('RGB'), dtype=np.float64)
    h, w, _ = a.shape
    out = (np.hstack([a.reshape(-1, 3), np.ones((h * w, 1))]) @ GRADE).reshape(h, w, 3)
    if grain:
        out += np.random.default_rng(seed(key)).normal(0, grain, (h, w, 1))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def resized(img, width):
    if width >= img.width:
        return img
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def crop(img, aspect, centre):
    w, h = img.size
    if w / h > aspect:  # too wide: trim the sides
        cw = round(h * aspect)
        x = (w - cw) // 2
        return img.crop((x, 0, x + cw, h))
    ch = round(w / aspect)
    y = min(max(round(h * centre - ch / 2), 0), h - ch)
    return img.crop((0, y, w, y + ch))


def write(img, base, jpeg_width, avif_widths, quality=72):
    os.makedirs(os.path.dirname(base), exist_ok=True)
    resized(img, jpeg_width).save(f'{base}.jpg', 'JPEG', quality=quality, optimize=True, progressive=True)
    for w in avif_widths:
        if w > img.width:
            continue  # never name an upscaled file after a width it doesn't have
        resized(img, w).save(f'{base}.{w}.avif', 'AVIF', quality=46 if w >= 1000 else 52)


def ingest_journey(src, slug, skip):
    done = []
    for slot, (jw, aw) in SLOTS.items():
        p = os.path.join(src, slug, f'{slot}.jpg')
        if not os.path.exists(p) or f'{slug}/{slot}' in skip:
            continue
        img = grade(ImageOps.exif_transpose(Image.open(p)), f'{slug}/{slot}', 0 if slot == 'texture' else GRAIN)
        write(img, os.path.join(ROOT, slug, slot), jw, aw, quality=55 if slot == 'texture' else 72)
        done.append(slot)
    p = os.path.join(src, slug, 'cover.jpg')
    if os.path.exists(p) and f'{slug}/cover' not in skip:
        big = ImageOps.fit(grade(Image.open(p), f'{slug}/cover'), (1120, 1400), Image.LANCZOS)
        base = os.path.join(ROOT, slug, 'cover')
        big.resize(COVER[0], Image.LANCZOS).save(f'{base}.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        for w in COVER[1]:
            resized(big, w).save(f'{base}.{w}.avif', 'AVIF', quality=46 if w >= 1000 else 52)
        done.append('cover')
    return done


def ingest_road(src, skip):
    folder = os.path.join(src, 'road')
    done = []
    for name in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(name)
        if ext.lower() != '.jpg' or f'road/{stem}' in skip:
            continue
        spec = ROAD.get(stem) or (BAND if stem.startswith('realm-band-') else None)
        if not spec:
            continue
        aspect, centre, jw, aw, graded = spec
        img = Image.open(os.path.join(folder, name)).convert('RGB')
        img = grade(img, f'road/{stem}') if graded else ImageOps.grayscale(img).convert('RGB')
        write(crop(img, aspect, centre), os.path.join(ROOT, 'road', stem), jw, aw)
        done.append(stem)
    return done


def wire(slug):
    """Point the journey's scene file at the slot images that now exist (empty slots get a plate)."""
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'internal', 'content', 'scenes', f'{slug}.json')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        scene = json.load(f)
    has = lambda slot: os.path.exists(os.path.join(ROOT, slug, f'{slot}.jpg'))
    rel = lambda slot: f'generated/{slug}/{slot}.jpg' if has(slot) else ''
    scenes = [rel(s) for s in ('scene-1', 'scene-2', 'scene-3')]
    while scenes and not scenes[-1]:
        scenes.pop()
    scene['images'] = {'hero': rel('hero'), 'scenes': scenes, 'fork': rel('fork'),
                       'ending': rel('ending'), 'texture': rel('texture')}
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(scene, indent=2, ensure_ascii=False) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--slugs', default='', help='comma-separated; default: every folder in SRC')
    ap.add_argument('--skip', default='', help='comma-separated slug/slot to leave out (failed review)')
    ap.add_argument('--road', action='store_true')
    args = ap.parse_args()
    skip = {s.strip() for s in args.skip.split(',') if s.strip()}
    slugs = [s for s in args.slugs.split(',') if s] or sorted(
        d for d in os.listdir(args.src) if os.path.isdir(os.path.join(args.src, d)) and d != 'road')
    for slug in slugs:
        print(slug, ' '.join(ingest_journey(args.src, slug, skip)))
        wire(slug)
    if args.road:
        print('road', ' '.join(ingest_road(args.src, skip)))


if __name__ == '__main__':
    sys.exit(main())
