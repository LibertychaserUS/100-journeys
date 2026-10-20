# Fonts

The story serif is self-hosted: subsets of two open-source fonts, served from this site under
`/static/assets/fonts/` (no font service, so it also works where Google is blocked). The UI text uses
the system sans and downloads nothing.

| Family in CSS | Font | Version | Copyright | Licence | Source |
|---|---|---|---|---|---|
| `Story Serif` (Chinese, 400 and 700) | Noto Serif SC | 2.003 | © 2017–2024 Adobe; Noto is a trademark of Google Inc. | SIL Open Font License 1.1 ([text](../../web/assets/fonts/OFL-NotoSerifSC.txt)) | [google/fonts `ofl/notoserifsc/NotoSerifSC[wght].ttf`](https://github.com/google/fonts/tree/main/ofl/notoserifsc) |
| `Story Serif Latin` (English, 400 and 700) | Newsreader | 1.003 | © 2020 The Newsreader Project Authors | SIL Open Font License 1.1 ([text](../../web/assets/fonts/OFL-Newsreader.txt)) | [google/fonts `ofl/newsreader/Newsreader[opsz,wght].ttf`](https://github.com/google/fonts/tree/main/ofl/newsreader) |

Neither licence declares a Reserved Font Name, so the subsets keep their names. Each WOFF2 file keeps
the font's copyright and licence records, and the licence texts ship next to the files.

## What is in the files

- Only the characters the site can show: 2,000 Chinese characters and 123 Latin ones, from the app's
  own copy and every string the server can send (journey content in both languages, the road, the
  Night Station's ticket fragments, the guide's replies).
- **Chinese**: static 400 and 700 cuts of the variable font, cut into `unicode-range` slices by
  where the characters appear, so a page downloads only the slices its story text needs. Spaces, digits
  and marks are in a small slice of their own, and Latin letters in another.
- **English**: static cuts of Newsreader, 400 at optical size 18 for text and 700 at optical size 48
  for titles.
- Everything uses `font-display: swap`. Vertical metrics are fixed in CSS (`ascent-override` and
  related descriptors), the same for the web font and the local Song face, so a swap does not move
  lines. While English loads, Georgia stands in with `size-adjust` set to Newsreader's widths.
- Text the subset does not cover, such as what travellers write on the Night Station, falls to a local
  face (`Story Serif Local`: Noto Serif SC or Source Han Serif where the reader has one, Song after
  that), then to the UI sans. It never falls to a synthetic bold.
- Vertical text (the zh closing line) keeps the `vert`/`vrt2` alternates, so its comma and full stop
  sit in the top-right of their cells.
- On the English home page the closing line's original, 缘溪行，忘路之远近。, is set from its own
  3 KB file (`Colophon Serif`), so an English page never loads a Chinese slice.
- The home page preloads the slices for its opening title.

## Weight per page (measured, first visit)

| Page | Chinese | English |
|---|---|---|
| Home | about 96 KB (9 files) | 31 KB |
| Explore | about 101 KB | 28 KB |
| About, Find | 62–72 KB | 28 KB |
| Compose | about 120 KB | 28 KB |
| A journey | 123–152 KB | 28 KB |
| Night Station | about 126 KB | 28 KB |

The home page shows different doors at different hours, and a door's card on hover. Its slices are
built to hold every door's name and every way of saying when a door opens, at both weights, so the
hour never pulls in a large slice. Since the home page also tells the threshold's story and carries a
passage from behind a door, three Night Station tickets and the invitation in the story serif, its
slices are weighted most heavily of all pages (see `PAGE_WEIGHT` in the build). English pages load only the two Latin files (and, on the home page, the closing line's original). The page's language is set
before the first paint, so the static opening never borrows the Chinese font for English text.

Fonts are cached across pages, so a journey opened from the home page reuses what the home page loaded.

Budget: home at most 110 KB, any page at most 160 KB, no render-blocking font, and no layout shift
from a font swap.

## Rebuilding

Run this after content or copy changes. The source fonts are not kept in the repo.

1. Start the app, then measure which characters each page renders in the story font:
   `NODE_PATH=e2e/node_modules node scripts/fonts/measure.cjs http://localhost:8080 > scripts/fonts/usage.json`
2. Download the two source fonts above, then build:
   `python3 scripts/fonts/build.py --noto 'NotoSerifSC[wght].ttf' --newsreader 'Newsreader[opsz,wght].ttf'`
   This needs fontTools and brotli. It rewrites `web/assets/fonts/*.woff2`, `web/css/fonts.css` and the
   preload lines in `web/index.html`.
