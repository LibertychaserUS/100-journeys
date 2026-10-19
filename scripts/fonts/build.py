#!/usr/bin/env python3
"""Build the self-hosted story fonts: subset WOFF2 slices plus web/css/fonts.css.

Fonts (both SIL Open Font License 1.1, see docs/content/FONTS.md):
  Noto Serif SC  (variable, wght)        -> "Story Serif",       Chinese text, 400 and 700
  Newsreader     (variable, opsz + wght) -> "Story Serif Latin", English text, static 400 and 700 cuts

Only characters the site's own text uses are kept. The Chinese font is cut into slices by where
characters appear, so a page downloads only the slices its story text needs. usage.json (from
measure.cjs) lists the characters each page renders in the story font at each weight; characters
with the same set of pages share a slice, and small slices are merged where that costs pages the
fewest extra bytes. Text the subset does not cover (for example what travellers write) falls
through to a local Song face, then to the UI sans.

Run after content or copy changes (the source fonts are not kept in the repo):
  node scripts/fonts/measure.cjs http://localhost:8080 > scripts/fonts/usage.json
  python3 scripts/fonts/build.py --noto NotoSerifSC[wght].ttf --newsreader 'Newsreader[opsz,wght].ttf'
Needs fontTools and brotli.
"""
import argparse, glob, hashlib, heapq, io, json, os, re, sys, unicodedata
from collections import Counter, defaultdict

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'web', 'assets', 'fonts')
CSS_OUT = os.path.join(ROOT, 'web', 'css', 'fonts.css')
INDEX = os.path.join(ROOT, 'web', 'index.html')
USAGE = os.path.join(os.path.dirname(__file__), 'usage.json')
URL = '/static/assets/fonts/'

WEIGHTS = (400, 700)
GLYPH_BYTES = 180      # measured average for this font in WOFF2
FILE_BYTES = 3000      # per-file cost (headers, tables, a request)
# The same vertical metrics everywhere (the web font, the local Song fallback), so a swap never
# moves a line. Noto Serif SC's own hhea values.
CJK_METRICS = 'ascent-override: 115.1%; descent-override: 28.6%; line-gap-override: 0%;'
FEATURES = ['kern', 'liga', 'locl', 'vert', 'vrt2', 'vkna', 'vpal', 'halt', 'palt', 'ccmp', 'mark', 'mkmk']
LATIN_FEATURES = ['kern', 'liga', 'calt', 'onum', 'lnum', 'pnum', 'tnum', 'ccmp', 'mark', 'mkmk']
LATIN_CUTS = ((400, 18), (700, 48))  # (weight, optical size)


def content_files():
    return (glob.glob(os.path.join(ROOT, 'web/js/**/*.js'), recursive=True) + [INDEX] +
            glob.glob(os.path.join(ROOT, 'internal/content/**/*.json'), recursive=True) +
            glob.glob(os.path.join(ROOT, 'internal/road/*.json')) + glob.glob(os.path.join(ROOT, 'internal/road/*.go')))


def is_cjk(c):
    o = ord(c)
    return (0x2e80 <= o <= 0x9fff or 0xf900 <= o <= 0xfaff or 0xfe30 <= o <= 0xfe4f or 0xff00 <= o <= 0xffef) and not 0xac00 <= o <= 0xd7af


def ranges(chars):
    cps = sorted(set(ord(c) for c in chars))
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ', '.join(out)


def page_usage(entrance_names):
    """{page: {weight: set(chars)}} from usage.json. The home page changes with the hour (the doors
    in its opening, the next door to open and when) and with every door hovered, so it is widened to
    every door's name and every way of saying when a door opens, at both weights."""
    raw = json.load(open(USAGE, encoding='utf-8'))
    pages = {key: {w: set(v.get(str(w), '')) for w in WEIGHTS} for key, v in raw.items()}
    i18n = open(os.path.join(ROOT, 'web', 'js', 'i18n.js'), encoding='utf-8').read()
    when = ''.join(re.findall(r"'home\.(?:door\.(?:open|in|inMin|month)|close\.next)': '([^']*)'", i18n))
    for key in pages:
        lang, route = key.split(' ', 1)
        if route == '#/':
            for w in WEIGHTS:
                pages[key][w] |= set(''.join(entrance_names[lang]) + when + '0123456789')
    return pages


# How much a byte on each page counts: the home page is where most visits start.
PAGE_WEIGHT = {'#/': 8, '#/station': 3, '#/explore': 2}
MAX_SLICES = 40


def slice_weight(chars, pages, weight, freq):
    """Chars used on exactly the same pages share a slice; then merge the pair of slices that
    saves the most (weighted) bytes, while merging still saves bytes or there are too many."""
    names = sorted(pages)
    bit = {p: 1 << i for i, p in enumerate(names)}
    heavy = [(sum(bit[p] for p in names if p.split(' ', 1)[1] == r), w - 1) for r, w in PAGE_WEIGHT.items()]

    def wcount(x):
        return bin(x).count('1') + sum(extra * bin(x & m).count('1') for m, extra in heavy)

    sig = defaultdict(list)
    unseen = []
    for c in chars:
        mask = sum(bit[p] for p in names if c in pages[p][weight])
        (sig[mask].append(c) if mask else unseen.append(c))
    groups = dict(enumerate(sig.items()))

    def cost(a, b):
        (ma, ca), (mb, cb) = groups[a], groups[b]
        return (len(ca) * wcount(mb & ~ma) + len(cb) * wcount(ma & ~mb)) * GLYPH_BYTES - wcount(ma & mb) * FILE_BYTES

    heap = [(cost(a, b), a, b) for a in groups for b in groups if a < b]
    heapq.heapify(heap)
    nxt = len(groups)
    while heap and len(groups) > 1:
        c, a, b = heapq.heappop(heap)
        if a not in groups or b not in groups:
            continue
        if c >= 0 and len(groups) <= MAX_SLICES:
            break
        (ma, ca), (mb, cb) = groups.pop(a), groups.pop(b)
        groups[nxt] = (ma | mb, ca + cb)
        for o in groups:
            if o != nxt:
                heapq.heappush(heap, (cost(o, nxt), o, nxt))
        nxt += 1
    slices = sorted((sorted(cs) for _, cs in groups.values()), key=lambda cs: -max(freq[c] for c in cs))
    # never seen at this weight on any page: rarely needed, so a few frequency-ordered chunks
    unseen.sort(key=lambda c: -freq[c])
    slices += [sorted(unseen[i:i + 160]) for i in range(0, len(unseen), 160)]
    return slices


def woff2(font_bytes, text, features):
    f = TTFont(io.BytesIO(font_bytes))
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = features
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # keep the copyright and licence records
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    buf = io.BytesIO()
    f.flavor = 'woff2'
    f.save(buf)
    return buf.getvalue()


def write_font(data, stem):
    h = hashlib.sha256(data).hexdigest()[:10]
    name = f'{stem}.{h}.woff2'
    with open(os.path.join(OUT_DIR, name), 'wb') as fh:
        fh.write(data)
    return name


def instance(path, **axes):
    f = TTFont(path)
    out = instancer.instantiateVariableFont(f, axes)
    buf = io.BytesIO()
    out.save(buf)
    return buf.getvalue()


def latin_fallback_metrics(newsreader_path):
    """size-adjust and vertical overrides that make Georgia set English story text at
    Newsreader's widths while the web font loads."""
    georgia = {400: '/System/Library/Fonts/Supplemental/Georgia.ttf', 700: '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'}
    sample = 'The quick brown fox jumps over the lazy dog. Doors open at their own hour, in their own season.'
    out = {}
    for w, opsz in LATIN_CUTS:
        nr = TTFont(io.BytesIO(instance(newsreader_path, wght=w, opsz=opsz)))
        if not os.path.exists(georgia[w]):
            return None
        ge = TTFont(georgia[w])

        def width(font):
            cmap, hmtx = font.getBestCmap(), font['hmtx']
            return sum(hmtx[cmap[ord(c)]][0] for c in sample if ord(c) in cmap) / font['head'].unitsPerEm
        adj = width(nr) / width(ge)
        hh, upm = nr['hhea'], nr['head'].unitsPerEm
        out[w] = dict(size=adj * 100, ascent=hh.ascent / upm / adj * 100, descent=-hh.descent / upm / adj * 100, gap=hh.lineGap / upm / adj * 100)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--noto', required=True, help='NotoSerifSC[wght].ttf from github.com/google/fonts (ofl/notoserifsc)')
    ap.add_argument('--newsreader', required=True, help='Newsreader[opsz,wght].ttf from github.com/google/fonts (ofl/newsreader)')
    args = ap.parse_args()

    text = ''.join(open(f, encoding='utf-8').read() for f in content_files())
    freq = Counter(text)
    used = set(text)
    door_names = {'zh': [], 'en': []}
    for f in glob.glob(os.path.join(ROOT, 'internal/content/entrances/*.json')):
        d = json.load(open(f, encoding='utf-8'))
        for lang in door_names:
            door_names[lang].append(d.get(lang, {}).get('title', '').split(' · ')[0])
    pages = page_usage(door_names)

    noto = TTFont(args.noto)
    covered = set(chr(c) for c in noto.getBestCmap())
    cjk = sorted(c for c in used if is_cjk(c) and c in covered)
    # Latin and symbols inside Chinese story text (digits, №, ·, dashes, quotes) use Noto's own Latin
    zh_latin = set(chr(c) for c in range(0x20, 0x7f)) | {c for c in used if not is_cjk(c) and ord(c) > 0x7f and c in covered and ord(c) < 0x2e80}
    # spaces, digits and marks turn up in most Chinese story text; letters rarely, so they load apart
    zh_letters = sorted(c for c in zh_latin if unicodedata.category(c).startswith('L'))
    zh_marks = sorted(zh_latin - set(zh_letters))

    os.makedirs(OUT_DIR, exist_ok=True)
    for old in glob.glob(os.path.join(OUT_DIR, '*.woff2')):
        os.remove(old)

    css = ['/* Generated by scripts/fonts/build.py; do not edit. Fonts and licences: docs/content/FONTS.md */', '']
    report = []
    for w in WEIGHTS:
        static = instance(args.noto, wght=w)
        slices = [zh_marks, zh_letters] + slice_weight(cjk, pages, w, freq)
        for i, chars in enumerate(slices):
            name = write_font(woff2(static, ''.join(chars), FEATURES), f'story-serif-{w}-{i:02d}')
            css.append(f'@font-face {{ font-family: "Story Serif"; font-style: normal; font-weight: {w}; font-display: swap; '
                       f'src: url("{URL}{name}") format("woff2"); unicode-range: {ranges(chars)}; {CJK_METRICS} }}')
            report.append((name, len(chars)))
    # Local Song faces: cover what the subset does not (and stand in while it loads), same metrics
    css.append('')
    css.append(f'@font-face {{ font-family: "Story Serif Local"; font-weight: 700; src: local("Songti SC Bold"), local("STSongti-SC-Bold"), local("Noto Serif SC Bold"), local("NotoSerifSC-Bold"), local("Noto Serif CJK SC Bold"), local("Source Han Serif SC Bold"), local("SourceHanSerifSC-Bold"); {CJK_METRICS} }}')
    css.append(f'@font-face {{ font-family: "Story Serif Local"; font-weight: 400; src: local("Songti SC Regular"), local("STSongti-SC-Regular"), local("Noto Serif SC"), local("NotoSerifSC-Regular"), local("Noto Serif CJK SC"), local("Source Han Serif SC"), local("SourceHanSerifSC-Regular"); {CJK_METRICS} }}')

    # English: two static cuts of the Latin the site uses (text at optical size 18, titles at 48)
    nr_cov = set(chr(c) for c in TTFont(args.newsreader).getBestCmap())
    latin = sorted(c for c in (set(chr(c) for c in range(0x20, 0x7f)) | {c for c in used if not is_cjk(c) and ord(c) > 0x7f}) if c in nr_cov)
    css.append('')
    latin_files = {}
    for w, opsz in LATIN_CUTS:
        name = write_font(woff2(instance(args.newsreader, wght=w, opsz=opsz), ''.join(latin), LATIN_FEATURES), f'story-serif-latin-{w}')
        latin_files[w] = name
        report.append((name, len(latin)))
        css.append(f'@font-face {{ font-family: "Story Serif Latin"; font-style: normal; font-weight: {w}; font-display: swap; '
                   f'src: url("{URL}{name}") format("woff2"); unicode-range: {ranges(latin)}; }}')
    m = latin_fallback_metrics(args.newsreader)
    if m:
        for w, src in ((400, 'local("Georgia")'), (700, 'local("Georgia Bold"), local("Georgia-Bold")')):
            v = m[w]
            css.append(f'@font-face {{ font-family: "Story Serif Latin Fallback"; font-weight: {w}; src: {src}; '
                       f'size-adjust: {v["size"]:.2f}%; ascent-override: {v["ascent"]:.2f}%; descent-override: {v["descent"]:.2f}%; line-gap-override: {v["gap"]:.2f}%; }}')
    with open(CSS_OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(css) + '\n')

    # The opening title's slices, preloaded on the home page (marked lines in index.html)
    zh_pre = []
    for line in css:
        if 'font-weight: 700;' in line and '"Story Serif"' in line:
            cps = set()
            for part in re.search(r'unicode-range: ([^;]+);', line).group(1).split(', '):
                a, _, b = part[2:].partition('-')
                cps |= set(range(int(a, 16), int(b or a, 16) + 1))
            if any(ord(c) in cps for c in '桃源百旅'):
                zh_pre.append(re.search(r'url\("[^"]+/([^"/]+)"\)', line).group(1))
    html = open(INDEX, encoding='utf-8').read()
    block = ("        // fonts:begin (written by scripts/fonts/build.py)\n"
             f"        var fp = bl === 'zh' ? {json.dumps(zh_pre)} : {json.dumps([latin_files[700]])};\n"
             "        fp.forEach(function (f) { var l = document.createElement('link'); l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous'; l.href = '" + URL + "' + f; document.head.appendChild(l); });\n"
             "        // fonts:end\n")
    new, n = re.subn(r"        // fonts:begin.*?// fonts:end\n", block, html, flags=re.S)
    if n != 1:
        sys.exit('index.html: fonts:begin/fonts:end markers not found')
    open(INDEX, 'w', encoding='utf-8').write(new)

    total = sum(os.path.getsize(os.path.join(OUT_DIR, n)) for n, _ in report)
    print(f'{len(report)} files, {total // 1024} KB in all; {len(cjk)} Chinese characters, {len(latin)} Latin')


if __name__ == '__main__':
    main()
