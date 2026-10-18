# 2026-10 UI/UX redesign · 改版前后

“灯笼夜游 / Lantern Night”: the UI is night, and light only falls on what you can act on.
Design rules, tokens and contrast ratios: [`docs/ui-components/DDD-spec.md`](../../ui-components/DDD-spec.md).

Left: `main@7986657`. Right: this redesign. Same demo data, Chromium 1440×900 and 390×844.

| | Before | After |
|---|---|---|
| Home | ![](home-before.jpg) | ![](home-after.jpg) |
| Explore, after clicking a filter (before: stuck on skeletons) | ![](explore-filter-before.jpg) | ![](explore-filter-after.jpg) |
| Detail | ![](detail-before.jpg) | ![](detail-after.jpg) |
| Detail, light theme (before: white headline on white) | ![](detail-light-before.jpg) | ![](detail-light-after.jpg) |
| Wrong password (before: “HTTP 401”) | ![](login-error-before.jpg) | ![](login-error-after.jpg) |
| My trips | ![](profile-before.jpg) | ![](profile-after.jpg) |

| Phone | Before | After |
|---|---|---|
| Home (before: no log-in entry) | ![](m-home-before.jpg) | ![](m-home-after.jpg) |
| Detail (after: booking bar) | ![](m-detail-before.jpg) | ![](m-detail-after.jpg) |
| Recharge (before: invisible amounts) | ![](m-recharge-before.jpg) | ![](m-recharge-after.jpg) |
| Checkout with a shortfall | — | ![](m-checkout-after.jpg) |

English UI and content:

![](en-detail-after.jpg)

## Verification

- Playwright: 63 tests (desktop Chromium + Pixel 7), including axe WCAG 2.1 A/AA scans of 7 pages in both themes.
- axe on `main`: 102 violation nodes across home, explore, detail and login (dark + light). This branch: 0.
- `go test ./...`, the CI stress profile, `go vet`, `node --check` and the generated-docs check all pass.
