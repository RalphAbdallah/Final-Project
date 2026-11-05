# splIT: Build Plan

**Current phase:** D.5 and Phase 9 (design pass, hardening, demo) · **Built so far:** payer accounts, get-paid setup, bills from receipt photos (OpenAI), share screen with QR, guest flow and split engine, payer bill screen (mark paid, own claims, card paid, edit) and dashboard, all on Supabase · **Next task:** guests can view the receipt photos (rest of P2.5), D.5 critique/audit, P9.x · **Deadline:** TBD ([PRD Q13](PRD.md#13-open-questions))

What to build lives in [PRD.md](PRD.md); how it looks lives in [DESIGN.md](DESIGN.md). This file is the order of work and the record of what's done. The iteration protocol is in [CLAUDE.md](../CLAUDE.md).

**Rules of the road**
- One iteration = one small, working slice, usually 1 to 3 tasks.
- Task IDs (`P2.3`) go in commit messages.
- After every iteration: tick the boxes, add a row to the [Iteration log](#iteration-log), record any [Decisions](#decisions), and update the status line above.
- A phase is done only when its **Done when** check passes.

---

## Architecture

```
Guest phone ─┐
             ├──▶ React (Vite) on Vercel ──REST──▶ Express API on Render ──▶ Supabase Postgres
Payer phone ─┘          │                              │                   Supabase Storage
                        └── Supabase Auth (payer) ─────┘ verifies token
```

### Repo layout (proposed)

```
frontend/               React + Vite, plain CSS (own node_modules)
  src/pages/            Home, payer/GetPaid (/get-paid), guest/GuestBill (/b/:shareToken); later auth, dashboard, bill editor, share
  src/components/       Sheet, Stepper, Amount, Avatars, Toast, StatusChip, Icon, WalletLogo
  src/lib/              api, money, qr (reads QR images), wallets, people
  src/styles/           tokens.css (from DESIGN.md), base.css, layout.css
backend/                Node + Express REST API (own node_modules)
  src/routes/           me (get-paid setup), share (guest); later bills, items
  src/split/            Split engine: pure functions + tests
  src/store.js          In-memory data + demo bill until Postgres (P1.1)
  src/db/migrations/    Numbered .sql files (P1.1)
inspo/                  Design references (drives DESIGN.md)
MD/                     PRD.md · PLAN.md · DESIGN.md (+ PRODUCT.md from Phase D)
CLAUDE.md               Loads the MD/ docs into every session
splIT_proposal.md       The submitted proposal (read-only)
```

### Environment variables

| Where | Variable | Purpose |
| --- | --- | --- |
| client | `VITE_API_URL` | Express API base URL |
| client | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase Auth only |
| server | `DATABASE_URL` | Postgres connection string |
| server | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Token verification, Storage |
| server | `CLIENT_ORIGIN` | CORS allow-list |
| server | `OPENAI_API_KEY` | Receipt scanning (N3 only) |

### API sketch

**Payer routes** need `Authorization: Bearer <Supabase access token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/me` | Profile; creates the `users` row on first call |
| PUT | `/api/me` | Update name, wallet phone |
| GET | `/api/bills` | The payer's bills with collected/outstanding totals |
| POST | `/api/bills` | Create a bill (generates `share_token`) |
| GET | `/api/bills/:id` | Bill, items, members, split breakdown |
| PATCH / DELETE | `/api/bills/:id` | Edit or delete a bill |
| POST | `/api/bills/:id/items` | Add an item |
| PATCH / DELETE | `/api/bills/:id/items/:itemId` | Edit or remove an item |
| PUT / DELETE | `/api/bills/:id/receipt` | Upload, replace or remove the receipt photo |
| PUT / DELETE | `/api/bills/:id/claims/:itemId` | The payer's own claims (body: `units`) |
| PATCH | `/api/bills/:id/members/:memberId` | Payer status change: confirm, not received, undo; the payer's own tip |
| DELETE | `/api/bills/:id/members/:memberId` | Remove a member |

**Guest routes** use the share token in the path, and the `X-Guest-Token` header once joined.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/share/:shareToken` | Public bill view, plus the guest's own share when a token is sent |
| POST | `/api/share/:shareToken/join` | Join with a name; returns the member and `guest_token` |
| PUT / DELETE | `/api/share/:shareToken/claims/:itemId` | Set units claimed (body: `units`), or unclaim |
| PATCH | `/api/share/:shareToken/me` | Set tip and method; mark paid or undo |

---

## Phases

Phases 0 to 3 need no visual design. Phase 3 can run in parallel with Phase 2. Screens in Phases 4 to 7 are built structurally (semantic HTML, minimal layout CSS) until design tokens land in D.4, then styled.

### Phase 0: Setup
- [ ] **P0.1** `git init`, `.gitignore` (`node_modules`, `.env*`, build output), GitHub repo, add teammates. Repo on GitHub (`RalphAbdallah/Final-Project`, no `.env` committed); teammates still to add
- [x] **P0.2** Scaffold `frontend/` with Vite + React, React Router, plain CSS
- [x] **P0.3** Scaffold `backend/` with Express: `/health`, CORS, JSON error handler; `.env` loaded with Node's `--env-file-if-exists` (no `dotenv` needed). `.env.example` in both folders
- [x] **P0.4** Supabase project: email/password auth on, private `receipts` storage bucket. Project created (eu-west-1), keys in both `.env` files, `npm run db:check` connects, `receipts` bucket created (`npm run storage:setup`)
- [ ] **P0.5** ESLint + Prettier, npm scripts (`dev`, `test`, `lint`) in both packages
- [x] **P0.6** Deployed 2026-11-03. Frontend: https://final-project-agxf.vercel.app (Vercel, root `frontend`, `vercel.json` rewrites so `/b/…` links open the app). Backend: https://split-api-vpsr.onrender.com (Render, Frankfurt, free plan, sleeps after 15 min idle). Full flow verified on the live site (sign-up, QR, sample bill, guest pays, reload, log-out)

**Done when:** the deployed client calls the deployed API's `/health` and shows the response.

### Phase 1: Database and payer auth (M1)
- [x] **P1.1** (`backend/src/db/migrations/001_initial.sql`, applied with `npm run db:migrate`; money as bigint minor units; row level security on every table so only the backend can reach data) First migration: the five tables with the changes and constraints in [PRD §10](PRD.md#10-data-model) (claim units, per-member tip, payer member row, tax rate, tax included)
- [x] **P1.2** DB access layer (`pg` pool, `backend/src/repo/postgres.js`); tests use the same methods in memory (`repo/memory.js`). Instead of a seed script, each payer can create a sample bill (`POST /api/me/sample-bill`) until the bill editor exists
- [x] **P1.3** Client: sign up, log in, log out with Supabase Auth; protected routes (`/login`, `/signup`, `RequireAuth`). Supabase client loads on payer pages only
- [x] **P1.4** Server: auth middleware that verifies the Supabase token (`getClaims`) and sets `req.user`, creating the payer's `users` row on first use
- [x] **P1.5** `GET /api/me` and the get-paid setup: `PUT` / `DELETE /api/me/payouts/:wallet`, screen at `/get-paid` (pick wallets, steps, upload QR, read it in the browser)

**Done when:** a payer signs up, adds their Whish QR code, reloads and is still logged in with the link saved; the API rejects tokenless requests with 401.

### Phase 2: Bills, items, receipt photo (M2, M3)
Changed 2026-11-03: bills are created from photos only (PRD M2). The AI reads, the app calculates, the payer reviews.
- [x] **P2.1** `POST /api/me/receipts/read`: up to 6 photos (was 4; raised 2026-11-03) → OpenAI (`receipts/openai.js`, strict JSON schema, copies printed values only) → `buildDraft` (`receipts/draft.js`: unit prices, uneven splits, tax from rate, all-caps names) → draft + stored photo paths
- [x] **P2.2** `POST /api/me/bills` (validated reviewed draft → bill, items, photos, payer member) and `GET /api/me/bills/:id` (own bills only)
- [x] **P2.3** New bill screen `/bills/new`: add photos in order → read → review (place, date, currency, items editable in a sheet, add a missed item, tax/rate/included/service) with the check against the printed total → create
- [x] **P2.4** Photos downscaled on the phone (≤ 2000 px JPEG), stored in the private `receipts` bucket (`npm run storage:setup`), rows in `bill_photos` (migration 002)
- [ ] **P2.5** Payer bill view with totals and photos (signed URLs); guests can view the photos. Payer side done (`/bills/:id`, receipt thumbnails); guests: still to do
- [x] **P2.6** Edit a bill after creating it (items, extras), with PRD Q7 rules once guests have joined. `/bills/:id/edit`: Check the bill again, saved in place; currency fixed; a quantity can't go below what's claimed; paid guests whose total changed are flagged
- [ ] **P2.7** (On hold, team note 2026-11-03) Receipt-reading accuracy eval. So far gpt-4.1-mini is exact on 12/12 reads of the 3 receipts in `Receipts/`, but only one is a real photo. Plan: team adds 15-25 real receipt photos (long multi-photo, dim/angled/faded, Arabic, LBP-only, discounts/voids/add-ons, service, VAT included); Claude writes the expected values for the team to verify; `npm run eval:receipts` reports accuracy per field (items, quantities, prices, tax, service, total) and lists every miss. Under 10 cents a run. Useful for the capstone report

**Done when:** a payer creates a bill from photos on their phone, and it's all there after a reload. Verified 2026-11-03 with the three receipts in `Receipts/` (headless, real OpenAI + Supabase).

### Phase 3: Split engine (M6, M7), test-first
- [x] **P3.1** Tests first, in `backend/src/split/`: single claimant, fewer units claimed than exist (5 pizzas, 3 claimed), more claimed than exist (sharing), leftover cents, proportional extras, both examples in [PRD §8](PRD.md#8-split-calculation-rules), unclaimed items, nothing claimed, zero extras, tax included in prices (not added), `S = 0`, LBP; tips stay out of the split and card total = bill total + tips
- [x] **P3.2** Pure function `(bill, items, members, claims) → per-member breakdown + unclaimed + bill total, tips, card total`, integer minor units
- [x] **P3.3** Conservation test across random bills: totals always sum to `T`
- [x] **P3.4** Include the breakdown in bill responses

**Done when:** all split tests pass, including the conservation test.

### Phase 4: Share and guest join (M4, M5)
- [x] **P4.1** Generate `share_token` on bill creation (`crypto.randomBytes`, base64url)
- [x] **P4.2** Share screen `/bills/:id/share`: QR code (`qrcode`), Copy link (lime), Share (native share sheet) below it (the "preview as guest" button was removed, 2026-11-03)
- [x] **P4.3** `GET /api/share/:shareToken` and the guest landing screen
- [x] **P4.4** Join: name form, `guest_token` saved in `localStorage` keyed by share token
- [x] **P4.5** Returning guest goes straight to their share; "Not you?" to join as someone else

**Done when:** a second phone scans the QR code, joins by name, and keeps its identity across a reload.

### Phase 5: Claiming (M6)
- [x] **P5.1** Claim endpoints with units, for guests (guest token, own member only) and the payer; locked while paid. Both share `claims.js` (one person per unit)
- [x] **P5.2** Claim screen: tap to claim one, + / − counter, "3 of 5 claimed" with claimants' names, running total with tax and service, optimistic updates
- [x] **P5.3** The payer claims their own items on the same screen ([PRD Q4](PRD.md#13-open-questions), resolved). "Your items" on the bill screen, same row as guests (`components/ItemRow.jsx`), instant preview
- [x] **P5.4** Poll for changes every few seconds while the page is visible (replaced by N1 later)

**Done when:** three phones claim at once and every screen converges on the split engine's numbers.

### Phase 6: Tips, pay and payment status (M8, M9, M11)
- [x] **P6.1** Wallet link test (2026-11-02). Superseded on 2026-11-03: guests open the payer's own link read from their QR code ([PRD M8](PRD.md#m8-pay))
- [x] **P6.2** "Add a tip?" sheet after Done: dismiss, round up, or a custom amount; tip saved on the member; not shown once the card is paid
- [x] **P6.3** Pay screen: amount (share plus tip), breakdown, method picker (only the wallets the payer set up, plus cash)
- [x] **P6.4** Wallet flow: "Open Whish" links to the payer's own link, amount shown large and copied on tap
- [x] **P6.5** Mark as paid and Undo, with the transitions in [PRD §9](PRD.md#9-payment-status) enforced server-side. Superseded 2026-11-03: guests no longer mark themselves paid; the payer does (P6.6)
- [x] **P6.6** Payer actions: confirm, not received, confirm cash directly, undo confirm. Now: Mark as paid / Mark as not paid (snapshots what they owed), Remove from bill (unpaid only, two taps)
- [x] **P6.7** Card paid button for the payer: locks tips and the card total ([PRD Q16](PRD.md#13-open-questions), proposed). Dock of the bill screen, with Undo

**Done when:** every allowed transition works from the right role across two devices, and the rest return 409.

### Phase 7: Payer dashboard (M10)
- [x] **P7.1** Bills list, newest first, with collected, outstanding and confirmed count. Home is the dashboard: each bill with total and "$X owed" / "All paid"
- [x] **P7.2** Bill detail: bill total, tips and card total at the top; each member's name, share, tip, method, status and actions
- [x] **P7.3** Total still owed across all bills; flag totals that changed after payment (PRD Q7). "Still owed to you" on home (per currency); changed totals in amber on the bill

**Done when:** after a full demo run, the dashboard shows the right collected and outstanding amounts.

### Phase D: Design system
- [x] **D.1** Team adds reference screenshots and links to [inspo/](../inspo/)
- [x] **D.2** Write `MD/PRODUCT.md` (register, users from the PRD, personality and anti-references from the inspo). Drafted from the PRD and inspo; team to review
- [x] **D.3** Fill [DESIGN.md](DESIGN.md): dark top + white sheet, lime accent (team choices, 2026-11-03), apple-design for motion, materials and type
- [x] **D.4** Tokens in `frontend/src/styles/tokens.css`, generated from DESIGN.md
- [ ] **D.5** Style every built screen, then `/impeccable critique` and `/impeccable audit` each core screen and fix what they find

**Done when:** every MVP screen follows DESIGN.md and passes the audit with no critical issues.

### Phase 8: Nice-to-haves (order from [PRD §5.2](PRD.md#52-nice-to-haves-proposed-priority-order))
- [ ] **N1** Live updates: Socket.io room per bill, replaces polling
- [ ] **N2** USD/LBP: payer-set rate, both currencies shown
- [ ] **N3** Receipt scanning: OpenAI vision call from Express, JSON items, review screen
- [ ] **N4** Payment proof: screenshot upload when marking paid
- [ ] **N5** Reminders: nudge link after N days unpaid
- [ ] **N6** Saved friends

### Phase 9: Hardening and demo
- [ ] **P9.1** Server-side validation on every route; rate limits on join and claim
- [ ] **P9.2** Loading, empty and error states on every screen (`/impeccable harden`)
- [ ] **P9.3** Real-device pass: iOS Safari and Android Chrome, throttled network
- [ ] **P9.4** Accessibility pass: VoiceOver, TalkBack, reduced motion, contrast
- [ ] **P9.5** README, demo seed data, demo script (wake the Render API first, see PRD R4)
- [ ] **P9.6** Final presentation

---

## Testing

| Layer | Tool (proposed) | What |
| --- | --- | --- |
| Split engine | Vitest | Test-first unit tests and the conservation test (Phase 3) |
| API | Vitest + Supertest | Auth, ownership, guest-token scoping, status transitions |
| UI | Real phones | Each phase's **Done when** check at phone width; impeccable audit after Phase D |

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-11-02 | PRD, PLAN and DESIGN are read before every iteration (imported by CLAUDE.md) | One source of truth across sessions and teammates |
| 2026-11-02 | Default design language: impeccable + apple-design skills; DESIGN.md wins once written | Team choice |
| 2026-11-02 | Money is integer minor units in code, never floats (proposed) | Exact rounding; the PRD §8 invariant |
| 2026-11-02 | Express is the only data path; the client uses Supabase for auth only | Matches the proposal's architecture; all split logic stays server-side |
| 2026-11-02 | Items are claimed in units with a + / − counter; when more units are claimed than exist, the line is split by units claimed (PRD Q1, Q14) | Team answer: the table orders 5 pizzas and each person claims how many they had |
| 2026-11-02 | Tax amount and rate come off the receipt. Tips are per person, outside the split, and the payer sees bill total + tips = card total (new M11) | Team answer: the payer adds the tips to the card payment |
| 2026-11-02 | The payer has a member row and claims their own items (PRD Q4) | Team answer |
| 2026-11-02 | Tax marked "included in prices" is shown but not added again (PRD Q15) | Team answer |
| 2026-11-03 | Get-paid setup: the payer picks Whish, OMT, Neo, Suyool and uploads each wallet's receive-money QR; splIT reads the link in the browser and guests open it to pay (PRD M1, M8) | Team decision; no link can carry the amount, so the guest types it |
| 2026-11-03 | Look: dark top with your share, white sheet of items; lime accent; system font (MD/DESIGN.md) | Team choices from the inspo |
| 2026-11-03 | Two independent projects, `frontend/` and `backend/`, each with its own `node_modules`; no npm workspaces | Team request |
| 2026-11-03 | Build screens against an in-memory store and a dev payer until Supabase exists; the dev payer refuses to run in production | Lets the UI move ahead of P0.4 / P1.x without faking data in the frontend |
| 2026-11-03 | Bills are created from receipt photos only (up to 4), then reviewed; no blank form. Receipt scanning moves from N3 into M2 | Team decision |
| 2026-11-03 | OpenAI reads (model `gpt-5-mini`, set by `OPENAI_MODEL`); it only copies printed values. The app does every calculation and shows a mismatch with the printed total in amber, without blocking | Team decision; matches the proposal's OpenAI choice |
| 2026-11-03 | Reasoning effort `low` (`OPENAI_REASONING_EFFORT`), output capped at 8,000 tokens per read | Measured on `Receipts/`: 25-40% faster than the default, same results; "minimal" not reliably faster |
| 2026-11-03 | Receipt model switched to `gpt-4.1-mini` (no reasoning; effort only sent to gpt-5/o-series). Priority tier not used | Benchmarked 6 options on `Receipts/`: gpt-4.1-mini exact on all three and ~2× faster than gpt-5-mini low (also in an alternating A/B under the same load); gpt-5-nano misread one; gpt-4o-mini ~10× the tokens; priority gave no gain for 4.1-mini. OpenAI latency itself swings a lot (same call 2-28 s; one 120 s timeout) |
| 2026-11-03 | Receipt reads use `temperature: 0` (non-reasoning models only) | The team saw the same receipt read differently between tries; with randomness off, 3 reads of each receipt in `Receipts/` came back identical and correct |
| 2026-11-03 | Only the payer marks people as paid; guests can't mark or undo (PRD §9). Guest PATCH with a status → 403 `payer_only` | Team decision; the payer's confirm comes with the dashboard (P6.6) |
| 2026-11-03 | No sharing: each unit of an item goes to one person; claims never exceed the quantity (PRD M6, Q14). Enforced in the database (`claim_units`, migration 004: locks the item, counts the others' claims, writes) | Team decision |
| 2026-11-03 | Claims preview instantly on the phone with an exact copy of the split engine (`frontend/src/lib/split.js`, kept identical by `split/copy.test.js`); the server's answer replaces it | Team decision: totals waited ~0.3 s per tap on the database round trips (Lebanon → Ireland ~80 ms each) |
| 2026-11-03 | Review screen: no printed-total check; changing the currency converts at the exchange rate (printed, else 89,500 LBP per $1, editable) | Team request |
| 2026-11-03 | AI spend limits: 10 reads/hour, 30/day, 150k tokens/day per payer; 2M tokens/day for everyone; one read at a time (`receipts/limits.js`, `ai_usage` table, migration 003) | Team request: nobody can spam reads and drain the OpenAI credit |
| 2026-11-02 | No pre-filled amount in Whish. `whish.money/app/pay/<code>` opens the app, but the code is a Whish Pay invoice (the web link forwards to `pay.whish.money/invoice/pay/legacy?q=<code>`) that only merchants can create | Phone test plus following the link; a made-up code returns Whish Pay's error page |
| 2026-11-02 | The wallet button goes to the app's store page (App Store or Google Play), which shows Open when the app is installed. No direct links into the apps | Both sites publish link files that match the store apps (`whish.money` claims only `/app/pay/*`; `omt.com.lb` claims `/send-money`, `/wallet` and more), but a phone test opened neither app |

## Iteration log

| # | Date | Goal | Outcome |
| --- | --- | --- | --- |
| 0 | 2026-11-02 | Planning docs | `MD/` PRD.md, PLAN.md and DESIGN.md (placeholder), plus root CLAUDE.md, created from the proposal |
| 1 | 2026-11-02 | Team answers to Q1, Q3, Q4; wallet link check | PRD v0.2: unit claims, per-person tips (new M11), payer member row. P6.1 desk check done |
| 2 | 2026-11-02 | Phone test of wallet links; Q15, Q16 | No link opened either app. P6.1 closed; M8 now links to the store pages (all four verified). Q15 resolved; Q16 reworded with a proposed Card paid lock (P6.7) |
| 3 | 2026-11-02 | Pre-fill the amount in Whish? | Not possible: `/app/pay/` codes are merchant invoices. Added PRD Q17 (one-tap Whish shortcut) |
| 4 | 2026-11-03 | Use the payer's wallet QR code? | Added PRD Q18; waiting on a real Whish / OMT receive QR to decode |
| 5 | 2026-11-03 | Get-paid setup in the PRD; design system; first build | PRD M1/M8 rewritten; PRODUCT.md + DESIGN.md written; backend (split engine, guest and payout routes, 24 tests passing) and frontend (home, get-paid setup, guest bill with claim counters, tip and pay sheets) built and walked through in headless Edge at 390 px. Split into `frontend/` and `backend/` |
| 6 | 2026-11-03 | Supabase, git, database tables | `.env` files filled by the team; `pg` added; `db:check` and `db:migrate` scripts; schema applied (7 tables, RLS on, public key verified blocked); local git repo. Next: P1.2 |
| 7 | 2026-11-03 | Backend on Postgres; payer accounts | Repo layer (Postgres + in-memory for tests), Supabase token check, `/login` and `/signup`, logged-in home, sample bill per payer. 28 tests pass; end-to-end run against the real Supabase project passed (sign-up, QR, sample bill, guest pays, reload, log-out, test user deleted). Fixed a race where a slow first profile load reset the wallet picks. Windows Rolldown build pinned as an optional dependency |
| 8 | 2026-11-03 | Bills from photos; share screen | Migration 002 (`bill_photos`, `lbp_rate`), private `receipts` bucket, OpenAI reader, `buildDraft`, `/bills/new` (photos → read → review → create), `/bills/:id/share` with QR, recent bills on home. 45 tests pass. Real run with `Receipts/`: Castle (24 s) and Bistro (8 s) match their printed totals; Dinefine's paper is inconsistent ($59.50 of lines vs a $47.50 subtotal) and is flagged in amber. Test user and photos deleted |
| 9 | 2026-11-03 | Deploy; UI pass with the team, screen by screen (D.5 started) | Live on Vercel + Render. Landing rebuilt (centered logo, new copy, Log in / Create an account at the bottom). Log in / Sign up: big titles, no hints or placeholders, plain red one-line error. Onboarding: "How do you accept money?", wallet logos (`components/WalletLogo.jsx`) and full names (Whish Money, OMT Pay, Neo Bank Audi, Suyool), lime checks, "Continue"; link step "Link your / account" + logo, grey numbered steps joined by a faint line, upload pinned to the bottom, simpler failure message, no Skip. iPhone Safari fixes for status-bar / toolbar tint and the black bounce (see DESIGN.md). Dock is now sticky in the page; setup screens fit an iPhone 17 without scrolling |
| 10 | 2026-11-03 | Home, New bill, speed | Home: greeting at the top, "Edit payment methods", equal buttons; "You're ready to get paid" removed (Finish goes home). New bill opens the camera from home (`capture`), up to 6 photos (frontend + backend). Going back to home was slow (blank screen while `GET /api/me` took ~200 ms, ~2 s cold): profile now remembered in the client (`cachedProfile`, cleared on sign-in/out and new bills), payer row cached 60 s in the backend (~200 → ~105 ms), database connection warmed at start (cold 2.3 → 1.1 s) |
| 11 | 2026-11-03 | Why reading is slow; token use; AI limits | Measured: OpenAI is ~all of it (7-17 s/receipt at default effort); a photo costs ~1,300-4,000 tokens. Switched to `low` effort (Bistro 7.1 → ~6 s, Castle 16.6 → 12.6 s), photos now stored in parallel with the read, per-step timing in the log. Token usage recorded per read (`ai_usage`), limits enforced with clear "try again in…" messages; 49 tests pass. Logos inlined into the code so they appear with the screen |
| 12 | 2026-11-03 | Faster reading | Model → gpt-4.1-mini (see Decisions); database connections kept open 5 min (reconnecting to Ireland cost 0.6-5 s); token usage recorded without blocking the response. Remaining time is OpenAI's own latency, which varies by load. Reads now give up after 60 s (was 120) with "Reading is slow right now. Try again"; phone photos downscaled to 1600 px (was 2000). To do: set `OPENAI_MODEL=gpt-4.1-mini` on Render, then commit and push |
| 13 | 2026-11-03 | New bill polish; two receipts at once | Two different receipts in one read were merged and one was silently dropped: the AI now reports `receipt_count` and the read is refused with "You can only select 1 receipt." (verified with real reads; single receipts unchanged, identical over 3 reads each). Going back and reading the same photos again reuses the draft (no second AI call). "Choose from photos" above Read receipt; tapping a photo opens it full size. Scan animation (line sweeps up and down with a fading lime trail). All error messages in the sign-in style (red caption text, no box). `AI_LIMITS=off` switch for local use only (never on Render). Body gradient removed (caused a half-black, half-white flash on load). 50 tests pass |
| 14 | 2026-11-03 | Check the bill: subtotal; keep the cents | Subtotal row above tax and service. Amounts keep their cents: switching USD → LBP → USD restores every amount exactly (was $3.75 → LBP 4 → $4.00), and a receipt the AI calls LBP but whose amounts have cents is read as USD (7.50 was rounded to 8). 51 tests pass |
| 15 | 2026-11-03 | Check the bill: layout, currency, sheet flicker | Match / no-match pill removed (PRD M2, Q20 updated). Place, Date, Currency and a new Exchange rate field stacked. Changing the currency now converts at the rate (printed rate, else 89,500); switching back restores the exact amounts; no rate typed = switch disabled. Sheets no longer jump on open: `showModal()` focused the Close button while the panel was still below the screen and scrolled the dialog 409 px; the dialog is now `overflow: clip` (measured frame by frame: no scroll, smooth slide up) |
| 16 | 2026-11-03 | Long LBP amounts; rate only in LBP; date field on iPhone | Big amounts shrink to fit their space when they're too long (`Amount`, measured before paint; LBP 107,249,893 goes 56 → 48 px at 390 px, 44 px at 360 px); applies to the bill total, guest share, pay sheet and share screen. Exchange rate shows only when LBP is selected, and LBP amounts update as the rate is typed. Converting away from the receipt's currency always uses the current rate (a round trip used to reuse the old rate). Date field: Safari's native styling turned off (`appearance: none`) so it matches Place in size and width; to check on a real iPhone |
| 17 | 2026-11-03 | Sheets on iPhone; item and tax forms | Black bar at the top with a sheet open: iOS 26 Safari colors the status bar from an open fixed element's background-color, and the sheet's was transparent (read as black). The dialog now carries the page color at the top, dimmed like the scrim (white page → 50% gray, dark top → black), clipped so it is never painted; to check on a real iPhone. Sheets can't be dragged up any more, only down; the page can't bounce behind an open sheet. "Price each" and the tax amount ran off their columns (the input's natural width set the column): fixed, so Rate (%) shows again in the tax sheet; quantity stepper in the item form is now a 52 px field like the price. Big amounts: cents sit right against the whole number |
| 18 | 2026-11-03 | Black status bar, take two; keep the new bill across a reload | iPhone test: the clipped dialog color didn't change the black bar (Safari reads what is painted at the top edge). Now a solid strip under the status bar (`.sheet-status-bar`, fixed, `env(safe-area-inset-top)` tall) paints the dimmed page color; to check on the iPhone. Opening a sheet focuses the sheet, not ×, so no focus ring shows. New bill survives a reload: photos and the review (draft, fixes, screen, currency undo) saved in IndexedDB (`lib/newBillStore.js`), cleared on create, Back (cancel) and sign-out; reading again after a reload reuses the result (no AI call). Verified headless: photos, edited place and review screen all come back |
| 19 | 2026-11-03 | Unclear photos; tighter totals | The AI now lists photos it can't read (`unclear_photos` in the schema; a recognizable but unreadable receipt is still a receipt). The read stops with "Photo 2 isn't clear. Retake it and try again." and outlines that photo in red; removing it clears the message. Real reads: blurry photo alone → photo 1, clear + blurry → photo 2; the three clean receipts still read exactly; non-receipt and two-receipt refusals unchanged. 52 tests pass. Big amounts: "$" against the number, cents pulled in, thin space after "LBP" |
| 20 | 2026-11-03 | Share screen buttons | "Preview what guests see" removed. Copy link stays the main (lime) button with Share under it; Share only shows where the browser has a share sheet (not on plain http, like the laptop's network address). Seen while testing: the local backend restarts by itself now and then (`node --watch`, probably OneDrive touching files), which can drop a request in flight; local only |
| 21 | 2026-11-03 | Copy on plain http | Copy link (share screen) and the amount copy (pay sheet) did nothing on the laptop's network address: the Clipboard API is https-only. `lib/clipboard.js` falls back to the older select-and-copy (inside the open sheet when there is one, since a modal makes the page inert). Verified on http://192.168.1.6: "Link copied" and the link on the clipboard; inside a sheet too. Share stays https-only (browser rule): shows on Vercel, not on the network address |
| 22 | 2026-11-03 | Guest claim page | Wallet card stack removed (component and styles deleted), and the "Ralph takes Whish Money or cash" line. Name and Join moved from the bottom bar to the top of the sheet, above Items: a compact 44 px row (text stays 16 px so iPhone doesn't zoom), no hint line, errors only. The bottom bar shows only once joined; before that an empty white bar the height of the home indicator (`.dock--empty`), so the 2 px toolbar-tint strip no longer draws a white line over the items. Before joining, each Claim is a `<label>` for the name field: the tap itself puts the cursor in "Your name", which reliably opens the iPhone keyboard (a focus from code may not); the field has its own aria-label so the labels don't become its name. "Items" / "Details" section titles 20 → 24 px everywhere. Focused text fields: lime ring instead of dark green (lime on white is about 1.3:1, under WCAG's 3:1 for focus indicators; on the phone the keyboard and caret also show focus). White line at the bottom still seen on the iPhone: the 2 px empty bar was itself a line when Safari reports no home-indicator inset; it is now 16 px + the inset of solid white, so items slide under a clean edge (to check on the phone). Removed the "Type your name first" toast (Claim just puts the cursor in the name field) and the "Tap Claim on what you had." line under Done (unused `.dock__row` / `.dock__hint` styles deleted) |
| 23 | 2026-11-03 | Instant claim totals; tax and service lines | Measured: a claim took 370-430 ms, all database round trips (5 in a row, ~80 ms each to Ireland). Now 3 (bill and guest looked up together; the bill is read once, validated, and the answer is that read plus my change): 205-280 ms. And the total and "You:" change on the tap: `lib/preview.js` runs an exact copy of the split engine; over 4 test claims the preview matched the server to the cent. Tax and service rows only when non-zero (claim page breakdown, Check the bill); "Items $17.50 + tax (11%) and service $3.67" names only what applies, with the tax rate. 53 tests pass |
| 24 | 2026-11-03 | One person per unit | Sharing removed (PRD M6, §8, Q14 and the demo criterion updated). Server: 409 `not_enough_left` past what's left, checked again under a row lock in `claim_units` (migration 004, applied; execute revoked from Supabase's public roles) so two phones can't both take the last one. Claim page: + stops at what's left, a fully taken item has no Claim button, "Shared by" texts gone, "Someone just claimed that one." if beaten to it. Verified on Supabase: the hummus (taken) has no button, a second pizza by API → 409. 54 tests pass |
| 25 | 2026-11-03 | Claim greyed out; first name; sheet close | A fully claimed item keeps a greyed-out (disabled) Claim. "Pay Ralph" (first name only) on the button and the pay sheet. Sheet dim now rides the panel's spring instead of its own 0.25 s fade, and the status-bar strip fades with it (it used to vanish in one frame at the end): measured, dim 0.53 at half travel, 0 as the panel reaches the bottom. Then (iPhone screenshot): dim and the panel's upward shadow still showed over the dock near the end, so closing now fades both in 0.16 s (gone with the panel ~84% down); opening keeps the spring. Bills from before the one-person rule showed "3 of 2 claimed" and an active Claim: what's left is clamped at 0 and the count at the quantity |
| 26 | 2026-11-03 | Pay sheet; payer marks paid | Removed "Whish Money opens on paying…" and the guest's Mark as paid / Undo (the cash line is now "Hand Ralph $X in cash."). Server refuses guest status changes (403 `payer_only`); test replaced. P6.5 is superseded: marking paid moves to the payer (P6.6, dashboard). 54 tests pass. Pay sheet: Cash listed first and picked by default; choosing a wallet copies the amount in the same tap and the pill shows "Copied" |
| 27 | 2026-11-03 | Payer screens (P5.1, P5.3, P6.6, P6.7, P7.1-7.3, P2.6, P2.5 payer side) | Backend: `GET /api/me/bills/:id` is the full payer view (card total, every member's share, tip, method, status, a `changed` flag, the payer's own claims, signed photo links); `PATCH /bills/:id` (edit), `PATCH/DELETE /bills/:id/members/:id` (mark paid / not paid, remove), `PUT/DELETE /bills/:id/claims/:itemId` (payer claims), `PUT /bills/:id/card-paid`; the profile's bills carry collected / outstanding. Shared claim rules in `claims.js`. Frontend: home is the dashboard ("Still owed to you", each bill with what's owed); `/bills/:id` bill screen (night top with card total, People, Your items, receipt, breakdown, Card paid dock, person sheet); `/bills/:id/edit` (Check the bill again). All from existing tokens and components (guest.css rows and breakdown, Sheet, StatusChip, ItemRow moved to components). Status chip "Confirmed" now reads "Paid". 63 tests pass; walked through at 390 px against Supabase: mark paid, payer claim (+$4.23), card paid, rename |
| 28 | 2026-11-03 | Black page opening a bill | It was the empty loading screen while the bill screen's code and data arrived (0.74 s locally, longer on the phone; photo links were signed one by one). Now: the screen's own layout while loading, with the name and date straight from the dashboard; home preloads the bill screen's code; all photo links signed in one Storage request (`signedUrls`). Bill shown after ~0.5 s locally |
| 29 | 2026-11-03 | Edit and share loading; delete a bill | Edit opens on its own layout (bill total from the dashboard, placeholder fields), not a black page; Share draws the QR at once from the dashboard's data (38 ms after the tap) and has a loading layout for straight after creating a bill; the bill screen preloads both. Delete bill at the bottom of Edit (light red), with a confirmation sheet (red Delete bill / Keep the bill): `DELETE /api/me/bills/:id` removes the bill with everything on it and its photos; test added (64 pass). Sheet × no longer squeezed by a long title |
| 30 | 2026-11-03 | Chips, caching, profile, account | Paid / Unpaid chips: fully rounded, the word only (no dot). Sample bill button removed from home (the backend route stays for the tests). Caching: every screen opens on the last copy it saw and refreshes behind it (`lib/api.js`: payer data in sessionStorage, cleared on sign-out or another account; the guest's bill in localStorage); a bill reopens in ~8 ms; built assets cached for a year on Vercel (`vercel.json`, hashed file names). Profile page (`/profile`, person icon on home instead of Log out): payment methods (Edit), Account rows for name (`PATCH /api/me`, also renames the payer's row on each bill), email and password (Supabase Auth, from the browser; the email changes once the link sent to it is opened, then syncs to `users`), Log out, and Delete account with a confirmation (`DELETE /api/me`: photos, data and the Supabase login). 66 tests pass; rename and password change verified against Supabase |
| 31 | 2026-11-05 | Backend crashed on a network change | "Couldn't load your account" on the phone: switching Wi-Fi reset the idle database connections, `pg` emitted `error` on the pool with no listener, and Node exited (likely also the earlier "server stopped" cases; Supabase can drop idle connections on Render too). The pool now logs the drop and reconnects on the next query (`repo/postgres.js`). Verified: back up on the new network, database reachable, 66 tests pass |
| 32 | 2026-11-05 | Tip sheet copy and spacing | Title "Add a tip?" → "Tip"; the "Your share is… Tips go on Ralph's card…" line removed; "Type a tip" removed under Other (now centered in its tile). The options fieldset had the browser's padding and border: reset, so "Round your share up to" lines up with the title, a little closer to it. Closing the tip sheet (×, drag, Escape) no longer counts as "no tip": Done stays Done and asks again; only No tip or a tip turns it into Pay. Done shows no amount (centered); Pay Ralph keeps its amount. Keyboard on iPhone: Safari shifts the page up to keep the field in view, so the page's text showed under the sheet, through the see-through keyboard; the sheet now has a white extension below its bottom edge (`.sheet-panel::after`), and the dialog is `overflow: visible` (not a scroll container, so the opening jump stays fixed: re-measured, no scroll); to check on the phone |
| 33 | 2026-11-05 | Sheets with the iPhone keyboard, properly | Still bad on the phone: the page behind scrolled and showed through. Now, while a sheet is open, the page is pinned (body `position: fixed` at its scroll offset, put back exactly on close; iPhone ignores `overflow: hidden`), and the sheet fills only the visible part of the screen (tracks `visualViewport`: `--view-top` / `--view-height`), so it sits right on the keyboard; the field being typed in is scrolled to the middle of the sheet when the space shrinks. Verified with the window shrunk like a keyboard: sheet ends at the new edge, field visible, page scroll 245 → 245 after closing; opening and drag unchanged. To check on the iPhone. **Reverted the same day** at the team's request (looked bad on the phone): back to row 32's sheet (white extension under the panel, `overflow: visible`), no page pinning or `visualViewport` tracking |
| 34 | 2026-11-05 | Tip sheet: type it, or two quick picks | "Round your share up to", the four tiles and Other removed. Now: the tip amount field first (placeholder "Tip amount"), and under it the two smallest round-ups of the share as tiles (a $35 share: $36 / +$1 and $40 / +$5; $30.25: $31 and $35); tapping one fills the field, which is the one source of the amount. Verified: tap $31 → 0.75, "Add $0.75 tip". Then: the button just says "Add"; the placeholder is regular weight; while any sheet is open a finger drag scrolls nothing (page behind or sheet) unless the sheet's content is taller than the sheet (`touchmove` blocked in `Sheet.jsx`, no layout changes; drag to close unaffected) |
| 35 | 2026-11-05 | Red | Guest page: "Not claimed yet" → "Unpaid", label and amount in red, no dot (the payer's bill keeps "Not claimed yet", next to "Still owed"). The danger color is a truer red everywhere (`--danger` oklch(0.55 0.23 29), was 0.55 0.2 25; `--danger-soft` follows), still readable as text on white. Item rows: no "Not claimed yet", "Claimed" or "2 of 5 claimed": just the price and the avatars of who has it (`components/ItemRow.jsx`, guest and payer). Note: how many units an item has, and how many are left, no longer shows on the row (the + still stops at what's left; "10 of 15 claimed" stays in the Items header). A light grey hairline above the guest page's Done / Pay bar (`day-line`; the other screens' bars stay without one) |
| 36 | 2026-11-05 | Done, tip and pay in one sheet | The guest bar always says Done (no "Pay Ralph $X" step): Done opens the tip, Add or No tip moves on to paying, and closing at any point goes back to Done, which asks the tip again (straight to paying once the card is paid). Tip and pay are now one sheet (`pages/guest/PayFlow.jsx`, replaces TipSheet and PaySheet): the content cross-fades in place and its height eases to fit, so the sheet never slides down and back up (measured: dialog open every frame, top edge moves 18 px over ~170 ms). Add / No tip moved into the sheet's content so they animate with it; the pay step now clears the home indicator. Pay step: the "Items · tax and service · tip · Change tip" line removed. Then: Add / No tip waited for the server (~0.2-0.4 s, more on mobile data) and a full fade-out before the pay step; now it moves on the tap with the new amount and saves behind it (back to the tip with a message if the save fails), fade out 0.07 s / in 0.16 s: pay step fully shown ~0.2 s after the tap, mostly the test's own click |
| 37 | 2026-11-05 | Payer bill wording | Under People, "Not claimed yet" → "Unpaid", label and amount in red, no dot (same as the guest page). The dock's Card paid button now reads "Submit" (same action: locks tips at the card total; the button shows no amount. Once submitted, the dock is one solid red "Undo submit" button (replaces the check, "Card paid · $X", "Tips are locked…" and the grey Undo); the green "Card paid" chip next to Card total still shows the state. Verified: Submit → Undo submit → Submit) |
| 38 | 2026-11-05 | Payer bill: totals, photos, own tip | Wording: "Card total" → "Bill total" at the top and at the end of the breakdown; with no tips the breakdown ends on Bill total and the top has no "Bill + tips" line; with tips it reads Subtotal (the receipt), Tips, Bill total, and the top says "Subtotal $X + tips $Y". The big total turns green once the bill is covered: collected plus the payer's own share reaches it (collected alone never includes the payer's share, so it could never reach the total). Photos reloaded every 5 s: each poll brought freshly signed links (new token each time), so the images downloaded again; the screen now keeps a photo's link while it's under 5 minutes old (links last 10). Not checked in the browser: the sample bill has no photos. The payer can now tip (PRD M11, was missing): "Your tip" row under Your items opens the guests' tip sheet (`TipSheet` from `PayFlow.jsx`); `PUT /api/me/bills/:id/tip`, 409 `tip_locked` once submitted; test added (67 pass). Verified at 390 px: tip $0.82 → Subtotal $116.16 + tips $0.82 = $116.98; all three guests marked paid and the last item claimed → total green |
| 39 | 2026-11-05 | Edit bill wording | "Delete bill" → "Delete", on the page and on the confirmation sheet's red button (the sheet's title still says "Delete this bill?"). Pay step: "How are you paying?" → "Payment method". Person sheet (payer): the button is just "Mark as paid", centered, no amount (the amount is already shown large above it) |
| 40 | 2026-11-05 | Toast | The pop-up message is now a pill as wide as its text (24 px radius, was a full-width 14 px box), `night` at 78% with a blur of the page behind it; solid when the phone asks for reduced transparency. Checked at 390 px ("Maya marked as paid.") |
| 41 | 2026-11-05 | Rate limits on join and claim (P9.1, PRD §11) | `backend/src/rateLimits.js`, counted in memory per window. Join: 20 per bill per 10 min, 30 per network address per 10 min. Claims (guest and payer, + − and unclaim): 60 per person per minute, 300 per address per minute. Mostly per bill and per person because a table often shares one Wi-Fi address; the address limits are a backstop. Past a limit: 429 `too_many_requests` with `retryAfter` and a Retry-After header; the guest sees "That's a lot of taps. Try again in 30 seconds." (claims) or "A lot of people just joined this bill…" (join). `trust proxy` = 1 hop on Render (`RENDER` is set there; `TRUST_PROXY` overrides) so the address is the phone's, not Render's proxy: to check after deploying. All numbers in `.env` (`RATE_*`), `RATE_LIMITS=off` for local only. 5 tests added (72 pass). Server validation on every route (rest of P9.1) not reviewed yet. Also: guest page "This bill link doesn't work" → "This bill doesn't exist" |
| 42 | 2026-11-05 | Show password | Password fields (Log in, Create an account, Profile → New password) have an eye button at the right end that shows or hides what's typed (`components/PasswordInput.jsx`, new `eye` / `eyeOff` icons). The tap doesn't take focus, so the keyboard stays up and the cursor stays put; hidden again each time the screen opens; labelled "Show password" / "Hide password" for screen readers. Verified at 390 px: Log in toggles text ↔ dots with focus kept; changing the password from Profile still works |
| 43 | 2026-11-05 | Change password asks for the current one | Profile → Password is now "Change password" with two fields: Current password, then New password (both with the eye). Supabase's password change doesn't check the old password, so the app checks it first by signing in with it on a separate throwaway client (`checkPassword` in `lib/supabase.js`; the app's own session and its sign-in events aren't touched, and the check's own session is ended). Wrong → "Incorrect password.", the field outlined in red, nothing changes (too short: "New password must be at least 8 characters."; the message sits closer to the fields and the button). New must be 8+ characters and different. Verified against Supabase: wrong one refused; right one changes it; still logged in after a reload; after logging out, the new password logs in. Note: this is a check in the app; someone holding a live session could still call Supabase directly (Supabase's "Secure password change" setting would enforce it server-side) |
| 44 | 2026-11-05 | Spinner where there's no skeleton | Screens that showed a blank dark page while loading (app start, Home, Profile, Get paid, and a page's code arriving) now show a lime spinner in the middle (`components/Loading.jsx`, `.spinner` in layout.css): a lime arc on a faint ring, fading in after 0.3 s so quick loads don't flash it. Reduced motion: no spinning, the ring breathes slowly. Screens with skeletons (bill, edit, share, guest bill) keep them |
| 45 | 2026-11-05 | Pages stack | Going deeper slides the new page in from the right over the current one, which eases 25% left and dims; going back slides the top page away to the right (0.42 s, ease-out, no bounce). Built on browser view transitions through React Router: `main.jsx` moved from `<BrowserRouter>` to a data router (`createBrowserRouter`, same routes, one Suspense in a root route), and `lib/stack.jsx` has `StackLink` / `useStackNavigate` with a direction. Forward: Landing → Log in / Create an account, Home → Profile / a bill / New bill, a bill → Edit / Share, Profile → Edit payment methods, Log in → Home, a new bill → Share. Back: every back chevron and Home link, Save changes and Delete in Edit, Finish in payment setup, Log out, cancelling a new bill. Not animated: Log in ↔ Create an account (siblings), the phone's swipe-back (native animation), reduced motion. Measured at 390 px: forward, new page 390 → 0 px and old 0 → −97 px over ~0.45 s; back the reverse. Taps during the slide don't reach the page (like iOS); test script waits for it |
| 46 | 2026-11-05 | Home and Profile | "Edit / Set up payment methods" removed from Home (just New bill now); payment methods are edited from Profile. Profile's Edit is now dark green (`lime-deep`, 6.5:1 on white), was plain lime |
| 47 | 2026-11-05 | Guest page once paid | The bar at the bottom shows just "Paid · $X" with the check; the "Ralph marked you as paid." line under it is removed |
| 48 | 2026-11-05 | Lower AI limits | Receipt reads: 3 per hour (was 10) and 10 per day (was 30) per payer; all payers together 250,000 tokens a day (was 2,000,000; about 90 one-photo reads, at most ~$0.10-0.20 a day). Per-payer 150,000 tokens a day unchanged. Defaults in `receipts/limits.js` and `.env.example`; Render uses them unless its `AI_*` variables are set. Local `.env` has `AI_LIMITS=off`, so they don't apply on the laptop |
