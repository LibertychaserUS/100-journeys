# Design-Driven Development Specification — DDD
**Standard**: IEEE 1016-2009 — Software Design Descriptions
**Project**: 100 Journeys Web App MVP
**Phase**: DDD — Design-Driven Development
**Tool**: UIUXProMax (mid-stage)
**Status**: DRAFT — awaiting UIUXProMax output

---

## 1. Design Philosophy

Visual identity for "100种不可思议的旅行":
- **Dark-first**: Deep black backgrounds, content glows from within
- **Typography-led**: Large display font (serif) as the hero element
- **Restrained motion**: Subtle fade/translate only, no gratuitous animation
- **Emotion over information**: Every page section should evoke feeling first

---

## 2. Design Viewpoints (IEEE 1016 §5)

### 2.1 Context Viewpoint — User journeys
| Route | Entry Point | Exit Points |
|---|---|---|
| `#/` Home | Direct / share link | → Explore, → Detail |
| `#/explore` | Nav, Home CTA | → Detail |
| `#/journey/:slug` | Explore card | ← Back, → Share |

### 2.2 Composition Viewpoint — Component tree
```
App
├── Nav
│   ├── Logo
│   ├── NavLinks [Home, Explore]
│   └── (mobile: Hamburger)
├── Pages
│   ├── HomePage
│   │   ├── HeroSection
│   │   │   ├── HeroImage
│   │   │   ├── HeroTitle
│   │   │   └── HeroSubtitle + CTA
│   │   └── FeaturedGrid
│   │       └── JourneyCard[]
│   ├── ExplorePage
│   │   ├── FilterBar
│   │   │   ├── TagFilter
│   │   │   ├── VisualStyleFilter
│   │   │   └── AdventureSlider
│   │   ├── JourneyGrid
│   │   │   └── JourneyCard[]
│   │   └── Pagination
│   └── DetailPage
│       ├── DetailHero (full-bleed image)
│       ├── DetailMeta (region, tags, indices)
│       ├── DetailStory (long-form text)
│       └── RelatedJourneys
└── Footer
```

### 2.3 Interface Viewpoint — Component contracts
> To be filled after UIUXProMax design output.
> Each component: props, states, visual variants.

---

## 3. Component Specifications

### 3.1 JourneyCard
**States**: default | hover | loading skeleton
**Props**:
- `title`: string
- `subtitle`: string
- `imageUrl`: string
- `region`: string
- `adventureIndex`: 1–10
- `visualStyle`: enum
- `tags`: Tag[]
- `slug`: string (for navigation)

**Design notes**:
- Dark card bg (`--color-bg-card`)
- Image takes top 60% of card, object-fit: cover
- Hover: image scale 1.04 + subtle glow border
- Adventure index displayed as filled dots (●●●○○)

### 3.2 FilterBar
**States**: default | active filter | loading
**Behavior**: filter changes trigger API call with debounce 300ms

### 3.3 HeroSection
**Full-viewport height** on home
**Background**: featured journey image with `--color-bg-overlay`
**Title**: `--font-display`, `--text-hero` size
**CTA button**: outlined, `--color-accent-primary`

---

## 4. Visual Style Variants

| Style | Feel | Color Accent | Typography Weight |
|---|---|---|---|
| `raw` | Gritty, authentic | Cool grey | Light |
| `surreal` | Dreamlike, abstract | Warm gold | Medium |
| `minimal` | Clean, meditative | Off-white | Thin |
| `dramatic` | Intense, cinematic | Deep red | Bold |

---

## 5. Responsive Breakpoints

| Breakpoint | Width | Grid |
|---|---|---|
| Mobile | < 768px | 1 column |
| Tablet | 768px–1024px | 2 columns |
| Desktop | > 1024px | 3–4 columns |

---

## 6. DDD Phase Gate Checklist

- [ ] UIUXProMax design brief submitted
- [ ] UIUXProMax wireframes/mockups received
- [ ] tokens.css updated from design output
- [ ] All component CSS files implemented (card, nav, filter, hero)
- [ ] All page CSS files implemented (home, explore, detail)
- [ ] All JS page files implemented with real DOM rendering
- [ ] Responsive layout verified at 3 breakpoints
- [ ] Visual review by Main agent
- [ ] Prompt log Phase 2 entry written
- [ ] CP-DDD-001 checkpoint created
- [ ] `v0.2.0-ddd` git tag created
