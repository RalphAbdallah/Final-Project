# Performance

Session 22 lab: audit the real build, fix one opportunity, measure again.

## Front end: Lighthouse

**Setup:** `npm run build && npm run preview` in `client/`, then Lighthouse 12.8.2 on the home page served by `vite preview` on localhost, mobile, headless Chrome (a fresh profile, like incognito). Full reports: [`lighthouse/before.report.html`](lighthouse/before.report.html) and [`lighthouse/after.report.html`](lighthouse/after.report.html).

| | Before | After |
| --- | --- | --- |
| Performance | 98 | 98 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| **SEO** | **91** | **100** |
| Largest Contentful Paint (good ≤ 2.5 s) | 2.0 s | 2.0 s |
| Cumulative Layout Shift (good ≤ 0.1) | 0 | 0 |
| Total Blocking Time (stands in for INP in a lab run) | 20 ms | 40 ms |

The Total Blocking Time change is normal run-to-run noise. The fix targeted SEO.

### The fix: a real `robots.txt`

**Found:** "robots.txt is not valid (19 errors)". There was no `robots.txt`. The rule in `client/vercel.json` that sends every path to the app (so bill links open) also caught `/robots.txt`, so search engines got the HTML page instead. A deployed site has the same problem, since Vercel applies the same rule.

**Fixed:** added [`client/public/robots.txt`](client/public/robots.txt). Vite copies `public/` into the build unchanged, and Vercel serves real files before applying rewrites. It also tells crawlers to stay out of `/b/` (guest links carry the bill's secret token) and `/bills/` (the payer's private screens).

**Result:** SEO 91 → 100; `/robots.txt` now answers `text/plain`.

### Not fixed, and why

- **Reduce unused JavaScript (33 KiB):** this is the main bundle (React, the router and the login screen) on the first screen. The pages are already code-split with `React.lazy` (`client/src/App.jsx`), so each page's code loads only when it's opened.
- **Render-blocking CSS (est. 150 ms):** one 4.8 KB stylesheet. Inlining critical CSS isn't worth the complexity at this size.
- **Images:** receipt photos are shrunk on the phone before upload (long side ≤ 1600 px, JPEG; `client/src/utils/images.js`), and the app ships no large images.
- **Caching:** hashed build files are cached for a year (`Cache-Control: immutable` in `client/vercel.json`).

## Back end: indexes

**Found:** the payer's dashboard runs `Bill.find({ userId }).sort({ createdAt: -1 }).limit(50)` (`GET /api/me`, `GET /api/me/bills`), and a bill's photos run `Photo.find({ billId })`. Neither had an index.

**Fixed:** `billSchema.index({ userId: 1, createdAt: -1 })` (same field order as the query) in `server/models/Bill.js`, and `photoSchema.index({ billId: 1 })` in `server/models/Photo.js`.

**Measured** with `explain('executionStats')` in `server/tests/indexes.test.js`, on a test database with 500 bills (25 per payer) and 100 photos (5 per bill):

| Query | Before | After |
| --- | --- | --- |
| Dashboard bills | `COLLSCAN` + in-memory `SORT`: reads all 500 bills to return 25 | `IXSCAN`: reads 25, returns 25 |
| A bill's photos | `COLLSCAN`: reads all 100 photos to return 5 | `IXSCAN`: reads 5, returns 5 |

The test fails if either index is removed. Mongoose creates the indexes in Atlas when the server starts.

## Tests

| Folder | Command | Result |
| --- | --- | --- |
| `server/` | `npm test` | 78 passed (API routes with Supertest, including 401 and 400 cases; split engine; receipt draft; limits; indexes) |
| `client/` | `npm test` | 6 passed (`src/components/Stepper.test.jsx`: renders, clicks, and the edges) |

To see a test catch a bug, `Stepper.jsx`'s "nothing left to claim" check (`value >= max`) was removed once: the test "stops at the units left" failed on `toBeDisabled()`, then passed again once the check was put back.

The first `npm test` in `server/` downloads a MongoDB binary for the in-memory test database (about 600 MB, once per computer).
