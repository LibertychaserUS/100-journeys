# Feature Roadmap — 100 Journeys
**Version**: 1.0 (frozen for 72h MVP)
**Date**: 2026-05-13
**Rule**: Items marked P0 are locked for MVP. P1/P2 require explicit approval to promote.

---

## P0 — MVP (72h Deadline, Non-Negotiable)

### Backend (SDD + TDD)
- [x] SQLite schema v1.1 (journeys + tags + mbti + ai_logs)
- [x] Go + Gin API (7 endpoints)
- [x] Rule-based Mock AI (recommend / mbti_quiz / greeting / risk)
- [x] Booking stub endpoint
- [x] Seed data (5 journeys, 8 tags, 16 MBTI, compatibilities)
- [ ] Cache layer (sync.Map LRU, TTL 60s)
- [ ] Unit + Integration tests (TDD Phase)
- [ ] k6 load test: 2000 VU, p95 < 100ms

### Frontend (DDD)
- [ ] Design tokens + CSS layer system
- [ ] 8-bit pixel AI Pet widget (floating, draggable)
- [ ] AI Pet: localStorage profile (dog/cat choice, custom name)
- [ ] AI Pet: 5-question MBTI quiz with weighted scoring
- [ ] AI Pet: trigger on 10s idle OR 3 page views
- [ ] Home page: Hero + Featured cards
- [ ] Explore page: 2-col masonry card grid + filters
- [ ] Detail page: Full-bleed hero + story + clue reveal
- [ ] Apple-level CSS animations (60fps, transform-only)
- [ ] Typography: size + weight + color vary by visual_style
- [ ] Skeleton loading states
- [ ] Responsive: mobile (375) / tablet (768) / desktop (1280)

### DevOps / Quality
- [ ] GitHub repo with full commit history
- [ ] 4 worktrees (main + frontend-dev + backend-dev + sql-dev)
- [ ] README with run instructions + mermaid ER diagram
- [ ] Prompt log (5 phases)
- [ ] Checkpoint files per phase
- [ ] Git tags: v0.0.0 → v1.0.0

---

## P1 — v1.1 (2 Weeks, Interfaces Prepared)

### Auth & Security
- [ ] Third-party captcha hardening integration
- [ ] WeChat / QQ OAuth login stubs
- [ ] User table (id, oauth_provider, oauth_id, nickname, avatar)
- [ ] Password hashing (bcrypt) for email login stub

### Social
- [ ] Comments table + API (journey_id, user_id, content, created_at)
- [ ] Comment UI on detail page
- [ ] "Like" / bookmark stub

### Admin
- [ ] Admin dashboard API stubs
- [ ] Content management (CRUD journeys)
- [ ] User behavior analytics stubs (page_views table)

### AI Enhancement
- [ ] DeepSeek API adapter (real model)
- [ ] Kimi API adapter (real model)
- [ ] AI conversation persistence (ai_logs table already exists)
- [ ] FAQ quick-ask rule expansion

### Infrastructure
- [ ] SQLite → PostgreSQL migration path
- [ ] Docker containerization
- [ ] CDN integration (real)

---

## P2 — v2.0 (1 Month, Architecture Prepared)

### Platform
- [ ] Multi-instance deployment (Kubernetes)
- [ ] Redis cache layer (replace sync.Map)
- [ ] Message queue for async tasks
- [ ] Full disaster recovery (automated backup + point-in-time restore)

### E-Commerce
- [ ] Real booking partner integration
- [ ] Payment gateway stubs (WeChat Pay / Alipay)
- [ ] Order management system

### Analytics
- [ ] Full user behavior tracking (heatmap, funnel)
- [ ] A/B testing framework
- [ ] Recommendation engine v2 (collaborative filtering)

### Community
- [ ] User profiles and travel logs
- [ ] Social sharing
- [ ] Community challenges / achievements

---

## Scope Freeze Agreement

**Signed off by**: [User to confirm]
**Date**: 2026-05-13

By confirming this roadmap, we agree:
1. P0 items are locked — no additions, no removals without mutual agreement
2. P1/P2 items will not be implemented during MVP phase
3. Interfaces and stubs for P1 may be created if they don't delay P0
4. New ideas go to P1/P2 backlog, not P0
