# API Contract — 100 Journeys
**Standard**: ISO/IEC/IEEE 29148:2018 (Requirements Engineering)
**Phase**: SDD — Spec/Schema-Driven Development
**Status**: DRAFT — to be completed in SDD phase

---

## Base URL
`http://localhost:8080/api`

## Endpoints

### GET /journeys
List journeys with optional filters.

**Query Parameters**

| Param           | Type    | Default | Description                          |
|-----------------|---------|---------|--------------------------------------|
| `tag`           | string  | —       | Filter by tag slug                   |
| `visual_style`  | string  | —       | `raw`\|`surreal`\|`minimal`\|`dramatic` |
| `adventure_min` | integer | 1       | Minimum adventure index (1–10)       |
| `adventure_max` | integer | 10      | Maximum adventure index (1–10)       |
| `obscurity_min` | integer | 1       | Minimum obscurity level (1–10)       |
| `page`          | integer | 1       | Page number                          |
| `limit`         | integer | 12      | Items per page (max 50)              |

**Response 200**
```json
{
  "data": [ /* Journey[] */ ],
  "total": 42,
  "page": 1,
  "limit": 12
}
```

---

### GET /journeys/:slug
Get single journey by slug.

**Response 200** — Journey object with full `story` text and `tags`.

**Response 404**
```json
{ "error": "journey not found" }
```

---

### GET /tags
List all available tags.

**Response 200**
```json
{
  "data": [
    { "id": 1, "name": "极限挑战", "slug": "extreme" }
  ]
}
```

---

### GET /health
Health check.

**Response 200**
```json
{ "status": "ok" }
```

---

## Data Models

### Journey
```typescript
interface Journey {
  id:              number;
  title:           string;
  slug:            string;
  subtitle?:       string;
  story?:          string;        // full text, only in detail response
  region?:         string;
  visual_style:    'raw' | 'surreal' | 'minimal' | 'dramatic';
  adventure_index: number;        // 1–10
  obscurity_level: number;        // 1–10
  image_url:       string;        // fully resolved URL (local or CDN)
  tags?:           Tag[];
  created_at:      string;        // ISO 8601
  updated_at:      string;
}

interface Tag {
  id:   number;
  name: string;
  slug: string;
}
```
