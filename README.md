# 100 Journeys — 100种不可思议的旅行

A lightweight MVP web app showcasing unconventional travel experiences.

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Go 1.22+ / Gin                    |
| Database | SQLite via `modernc.org/sqlite`   |
| Frontend | Vanilla HTML / CSS / JavaScript   |
| Routing  | Hash-based SPA routing            |
| Images   | Local static (CDN-ready via config)|

## Development Methodology

- **SDD** (Spec/Schema-Driven Development) — ISO/IEC/IEEE 29148:2018
- **DDD** (Design-Driven Development) — IEEE 1016-2009
- **TDD** (Test-Driven Development) — ISO/IEC/IEEE 29119

## Quick Start

```bash
# Install dependencies
go mod tidy

# Run database migrations
go run cmd/migrate/main.go

# Start server (default: http://localhost:8080)
go run cmd/server/main.go
```

## Project Structure

```
100-journeys/
├── cmd/server/          # Entry point
├── internal/
│   ├── handler/         # Gin route handlers
│   ├── service/         # Business logic
│   ├── repository/      # DB access layer
│   └── model/           # Data structures
├── db/
│   ├── schema.sql       # Table definitions
│   └── seed.sql         # Sample data (5 entries)
├── web/
│   ├── index.html       # SPA entry
│   ├── css/             # tokens → global → layout → components
│   ├── js/              # router, api, pages
│   └── assets/images/   # Local media
├── docs/
│   ├── schema/          # API contracts (SDD artifacts)
│   ├── ui-components/   # Design specifications (DDD artifacts)
│   ├── testing/         # Test plans (TDD / IEEE 29119)
│   └── prompts/         # AI prompt records (5 required phases)
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
└── e2e/                 # End-to-end tests
```

## API Endpoints

See `docs/schema/api-contract.md` for full specification.

## Image / CDN Configuration

Images are served locally by default. To switch to CDN:

```bash
MEDIA_PROVIDER=cdn CDN_BASE_URL=https://cdn.example.com ./server
```

The frontend reads `window.APP_CONFIG.mediaBase` injected by the server at startup.
