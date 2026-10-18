# Content contract · 桃源入口 / The Hundred Entrances

Every journey is an **entrance**: a real place that, in this world, only opens in a certain
season and hour. Each entrance is one bilingual JSON file. The files are the source of truth;
the database is rebuilt from them at startup.

```
internal/content/entrances/NNN-slug.json   ← one file per journey (embedded with go:embed)
        │  content.Load + content.Validate (structure + show-don't-tell lint)
        ▼
content.Sync (server start, after db/seed.sql; every file is re-applied so a restart never reverts to the seed copy)
        ├─ journeys              base row (zh), cover, price, scores
        ├─ journey_translations  en title / subtitle / hook / region / moods
        ├─ journey_entrances     no, realm, pace, scale, seasons, time, cover licence
        ├─ journey_content       structured story per locale (JSON)
        └─ journey_tags, journey_mbti
```

`db/seed.sql` still carries the original rows for journeys nobody has rewritten yet. As soon as a
JSON file exists for a slug, the file wins. A new slug in a JSON file is a new journey; nothing
else needs to change.

## File

`NNN` is the entrance number (001–100, unique), `slug` is kebab-case and stable: orders, saved
journeys and analytics reference it, so **never rename an existing slug** (the 12 seed slugs stay).

```jsonc
{
  "slug": "bolivia-salt-flat-trek",
  "entrance": {
    "no": 1,                       // 1–100, unique
    "realm": "mirror-salt",        // see vocabulary
    "pace": "day",
    "scale": "far",
    "seasons": ["rainy"],          // 1+ of the season vocabulary
    "time": "predawn"              // one of the time vocabulary
  },
  "journey": {
    "fantasy_type": "solitude",    // extreme | solitude | visual | culture | spiritual | night
    "visual_style": "surreal",     // raw | surreal | minimal | dramatic
    "adventure_index": 4,          // 1–10
    "obscurity_level": 6,          // 1–10
    "risk_level": 2,               // 1–5
    "price": 15999,                // coins, > 0
    "tags": ["solitude", "visual", "hidden"],
    "mbti": { "INFP": 5, "INFJ": 4, "ISFP": 4 }   // 2–4 types, score 1–5; matching only, never shown in copy
  },
  "cover": {
    "path": "generated/card-salt-mirror.jpg",      // under web/assets/images, unique per journey
    "license": "self-generated",                   // see Covers
    "source": "…"                                  // https page for third-party images
  },
  "zh": { /* Text */ },
  "en": { /* Text, same shape, same choice keys */ }
}
```

### Text (per language)

| Field | Shown as | Rules |
|---|---|---|
| `title` | hero title, cards | short; `意象 · 地名` works well (`镜面 · 乌尤尼盐沼`) |
| `subtitle` | meta / sharing | one line |
| `hook` | hero quote, cards | one image, ≤ 24 zh chars / ≤ 14 en words |
| `region` | crumbs, facts | `大洲 · 国家` / `Continent · Country` |
| `moods` | chips | 3–5 words |
| `opens` | "入口开放 / Opens", prep | when the entrance opens, in plain words (season + hour) |
| `role` | prologue title, ticket | who you are here, as a noun phrase (`找镜子的人`) |
| `premise` | prologue | 2–4 sentences, real and checkable (numbers, geography) |
| `mission` | highlighted line | one thing to do, concrete and small |
| `chapters` | numbered chapters | 2–5 chapters, each `title` + 1–3 `paragraphs` |
| `choice` | the fork | `prompt` + 2–3 `options` (`key`, `label`, `keeps`); keys identical in zh and en |
| `ending` | afterwards | ≤ 3 sentences, back in ordinary life |
| `facts` | "真实与虚构" | ≥ 2 items, each `text` + https `source` |
| `fiction` | "真实与虚构" | what is invented (the entrance, the people, the details) |

`keeps` is what the reader leaves with if they pick that option: a small concrete thing
(`一张没有寄出的明信片`), never a lesson.

## Voice: show, don't tell

The reader should recognise themselves in the scene, not be told who they are.

- Second person, present tense, sensory and specific. One unusual true detail beats three adjectives.
- Why it fits is **inside the story**: an INFP-leaning entrance has you not taking the photo and
  watching a cloud cross your toes; it never says so.
- No type codes, no trait vocabulary, no lecturing, no "因为你是… / as a…". `content.Validate`
  rejects type codes and these words in all reader-facing copy:
  `MBTI 人格 性格 内向 外向 理性 感性 直觉型 因为你是 作为一个 适合你这种 你天生 你这样的人`,
  `mbti personality introvert extrovert "because you are" "because you're" "your type" "people like you"`.
- Facts are true and sourced; fiction is labelled. Never invent dangerous practical advice;
  prep text stays generic (gear and risk are derived from the scores).
- English is written, not translated: same scene, natural idiom.

### Copy axiom: never signpost the moment

Nothing in the copy or the interface announces a stage of the journey the way a guide would:
no chapter called 入口 / 光进来 / 尾声 / "The entrance", no "now you are inside", "the light comes
in", "you will take home…". The moment is carried by the page (the scroll scene, its beat, the
light) and by concrete things in the prose. Chapter titles are an image, an object, a time or a
sensation: 冰凉的车窗, 脚尖上的云, 一千个亮点, 七点四十五分. The detail page shows no narrator labels
around the story either; it keeps only what using the page needs (booking, sources).
`content.Validate` rejects the common stage names as chapter titles in both languages.

### Writing toward the matching types

Every entrance has MBTI affinities. Write it from the angle its top-scoring types quietly enjoy,
without ever naming a type or a trait:

| Leaning | What the prose lingers on |
|---|---|
| NT | precise numbers, mechanisms, cause and effect, how a thing works or came to be |
| NF | inner quiet, meaning, metaphor, a private gesture nobody else sees |
| SP | sensation, motion, play, the present second |
| SJ | care for someone, order, provenance, small rituals done properly |

## Scenes (art direction)

Each journey's immersive page is drawn from `internal/content/scenes/<slug>.json`, kept apart from
the copy:

```jsonc
{
  "slug": "bolivia-salt-flat-trek",
  "motif": "mirror",            // mirror | descent | aurora | sky-rotate | mist | tide | track | map | rise
  "texture": "salt",            // salt | ember | stars | sand | ink | caustics | snow | dust | paper | haze | fog
  "arc": [{"h": 222, "s": 40}], // 3-8 tones, opening → ending; lightness comes from the theme
  "accent": "#f6c9d6",          // decorative only: glows and lines, never text or controls
  "beats": ["dark", "still", "flare"], // one per chapter: "" | dark | still | grey | flare | vast
  "images": { "hero": "", "scenes": [], "fork": "", "ending": "", "texture": "" }
}
```

A beat tells the motif what to do in that chapter: `dark` the light goes out, `still` the world
holds still, `grey` a faint first sign, `flare` the full moment, `vast` the space opens up. Images
are optional paths under `web/assets/images` (`generated/<slug>/hero.jpg`, `scene-1.jpg`…); empty
means the cover, framed differently per scene. `content.ValidateScene` and `UT-CONTENT-SCENE-001`
check every file.

## Vocabulary

Labels live in `web/js/i18n.js` under `entrance.*`.

| Key | Values |
|---|---|
| realm | `mirror-salt` 镜与盐 · `fire-stone` 火与石 · `ice-night` 冰与夜 · `sand-stars` 沙与星 · `mist-temple` 雾与寺 · `water-deep` 深水 · `city-rules` 城中规矩 · `old-roads` 古道 |
| pace | `hour` · `day` · `multi-day` |
| scale | `near` · `far` · `polar` |
| seasons | `spring` `summer` `autumn` `winter` `rainy` `dry` `polar-night` `midnight-sun` `any` |
| time | `predawn` `dawn` `morning` `noon` `afternoon` `dusk` `blue-hour` `night` `midnight` `any` |
| tags | `extreme` `solitude` `visual` `culture` `hidden` `nature` `spiritual` `night` |

Spread entrances across realms and MBTI types; each of the 16 types should have at least three
entrances where it scores 4–5.

## Covers

- Portrait JPEG, about 720×900, ≤ 250 KB, in `web/assets/images/` (`generated/` for our own).
- Unique per journey (a test checks this).
- `license`: `self-generated`, `CC0`, `public-domain`, `CC BY 4.0` or `CC BY-SA 4.0`. Third-party
  images need the https page as `source` and the author in [IMAGE_SOURCES.md](IMAGE_SOURCES.md).
- Never use an image whose licence you cannot name.

## API

| Endpoint | Adds |
|---|---|
| `GET /api/journeys/:slug?lang=` | `entrance` (all fields incl. cover licence) and full `content` |
| `GET /api/journeys?lang=` | `entrance` (no licence) and `content: { opens, role, locale }` |

`content.locale` is the language actually returned; missing English falls back to Chinese.
Journeys without a JSON file have neither field, and the detail page uses the older layout.

## Shared client state

Guests keep their state in `localStorage.guest_state` (see `web/js/guest.js`):

```js
{ v: 1,
  mbti: 'INFP',                 // '' until chosen
  mbti_source: 'self' | 'pet',  // how it was chosen
  choices: { 'bolivia-salt-flat-trek': 'postcard' },   // fork picks per slug
  composed: [ /* tickets from the compose game, each with a client-generated id */ ] }
```

It also holds `vid` (anonymous visitor id), `opened` (entrances opened), `dialog` (the guide's walk,
so it can resume) and `invite`. On sign-in `guest.js` sends `mbti` and `choices` once to
`POST /api/auth/guest/merge` and clears them locally; signed in, the account is the source of truth
(`Guest.mbti()`, `Guest.pick()`, `Guest.choose()`). `composed` tickets are replayed to the compose API,
which must be idempotent on the ticket `id`.

## Funnel events

Sent with `API.track(type, slug, meta)`; `meta` is stored as JSON together with an anonymous
visitor id (`Guest.vid()`), which the admin funnel uses to count each visitor once. The server drops
unknown types.

Funnel: `arrive` → `path_pick` (`path`: `self` | `pet` | `browse`) → `type_found` (`via`: `self` | `pet`)
→ `space_enter` → `entrance_open` → `register`. Also: `fork_choose`, `compose_start`, `compose_complete`.

## Checks

```bash
go test ./internal/content/ ./internal/handler/
```

`UT-CONTENT-001…005` validate every file (structure, vocabulary, lint, signpost titles, covers),
`UT-CONTENT-SCENE-001` the scene files, `IT-CONTENT-001/002` sync them into a fresh database and
survive a restart, `IT-API-CONTENT-001` checks the API shape, and
`E2E-DETAIL-001/008` check the page.
