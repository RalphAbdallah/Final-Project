# splIT: Build Plan

**Current phase:** Phases 5 to 7 (payer claims, payment confirmations, dashboard) · **Built so far:** payer accounts, get-paid setup, bills from receipt photos (OpenAI), share screen with QR, guest flow and split engine, all on Supabase · **Next task:** P5.3 (payer claims own items), P6.6 (payer confirms payments), Phase 7 dashboard · **Deadline:** TBD ([PRD Q13](PRD.md#13-open-questions))

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
  src/components/       Sheet, Stepper, Amount, Avatars, WalletStack, Toast, StatusChip, Icon
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
- [ ] **P0.1** `git init`, `.gitignore` (`node_modules`, `.env*`, build output), GitHub repo, add teammates. Local repo created 2026-11-03 (branch `main`, nothing committed yet); GitHub still to do
- [x] **P0.2** Scaffold `frontend/` with Vite + React, React Router, plain CSS
- [x] **P0.3** Scaffold `backend/` with Express: `/health`, CORS, JSON error handler; `.env` loaded with Node's `--env-file-if-exists` (no `dotenv` needed). `.env.example` in both folders
- [ ] **P0.4** Supabase project: email/password auth on, private `receipts` storage bucket. Project created (eu-west-1), keys in both `.env` files, `npm run db:check` connects; `receipts` bucket still to create (P2.4)
- [ ] **P0.5** ESLint + Prettier, npm scripts (`dev`, `test`, `lint`) in both packages
- [ ] **P0.6** Deploy skeletons: client to Vercel, server to Render, env vars set

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
- [x] **P2.1** `POST /api/me/receipts/read`: up to 4 photos → OpenAI (`receipts/openai.js`, strict JSON schema, copies printed values only) → `buildDraft` (`receipts/draft.js`: unit prices, uneven splits, tax from rate, all-caps names) → draft + stored photo paths
- [x] **P2.2** `POST /api/me/bills` (validated reviewed draft → bill, items, photos, payer member) and `GET /api/me/bills/:id` (own bills only)
- [x] **P2.3** New bill screen `/bills/new`: add photos in order → read → review (place, date, currency, items editable in a sheet, add a missed item, tax/rate/included/service) with the check against the printed total → create
- [x] **P2.4** Photos downscaled on the phone (≤ 2000 px JPEG), stored in the private `receipts` bucket (`npm run storage:setup`), rows in `bill_photos` (migration 002)
- [ ] **P2.5** Payer bill view with totals and photos (signed URLs); guests can view the photos
- [ ] **P2.6** Edit a bill after creating it (items, extras), with PRD Q7 rules once guests have joined

**Done when:** a payer creates a bill from photos on their phone, and it's all there after a reload. Verified 2026-11-03 with the three receipts in `Receipts/` (headless, real OpenAI + Supabase).

### Phase 3: Split engine (M6, M7), test-first
- [x] **P3.1** Tests first, in `backend/src/split/`: single claimant, fewer units claimed than exist (5 pizzas, 3 claimed), more claimed than exist (sharing), leftover cents, proportional extras, both examples in [PRD §8](PRD.md#8-split-calculation-rules), unclaimed items, nothing claimed, zero extras, tax included in prices (not added), `S = 0`, LBP; tips stay out of the split and card total = bill total + tips
- [x] **P3.2** Pure function `(bill, items, members, claims) → per-member breakdown + unclaimed + bill total, tips, card total`, integer minor units
- [x] **P3.3** Conservation test across random bills: totals always sum to `T`
- [x] **P3.4** Include the breakdown in bill responses

**Done when:** all split tests pass, including the conservation test.

### Phase 4: Share and guest join (M4, M5)
- [x] **P4.1** Generate `share_token` on bill creation (`crypto.randomBytes`, base64url)
- [x] **P4.2** Share screen `/bills/:id/share`: QR code (`qrcode`), Copy link, native share sheet, preview as guest
- [x] **P4.3** `GET /api/share/:shareToken` and the guest landing screen
- [x] **P4.4** Join: name form, `guest_token` saved in `localStorage` keyed by share token
- [x] **P4.5** Returning guest goes straight to their share; "Not you?" to join as someone else

**Done when:** a second phone scans the QR code, joins by name, and keeps its identity across a reload.

### Phase 5: Claiming (M6)
- [ ] **P5.1** Claim endpoints with units, for guests (guest token, own member only) and the payer; locked while paid. Guest side done; payer side waits on auth
- [x] **P5.2** Claim screen: tap to claim one, + / − counter, "3 of 5 claimed" with claimants' names, running total with tax and service, optimistic updates
- [ ] **P5.3** The payer claims their own items on the same screen ([PRD Q4](PRD.md#13-open-questions), resolved)
- [x] **P5.4** Poll for changes every few seconds while the page is visible (replaced by N1 later)

**Done when:** three phones claim at once and every screen converges on the split engine's numbers.

### Phase 6: Tips, pay and payment status (M8, M9, M11)
- [x] **P6.1** Wallet link test (2026-11-02). Superseded on 2026-11-03: guests open the payer's own link read from their QR code ([PRD M8](PRD.md#m8-pay))
- [x] **P6.2** "Add a tip?" sheet after Done: dismiss, round up, or a custom amount; tip saved on the member; not shown once the card is paid
- [x] **P6.3** Pay screen: amount (share plus tip), breakdown, method picker (only the wallets the payer set up, plus cash)
- [x] **P6.4** Wallet flow: "Open Whish" links to the payer's own link, amount shown large and copied on tap
- [x] **P6.5** Mark as paid and Undo, with the transitions in [PRD §9](PRD.md#9-payment-status) enforced server-side
- [ ] **P6.6** Payer actions: confirm, not received, confirm cash directly, undo confirm
- [ ] **P6.7** Card paid button for the payer: locks tips and the card total ([PRD Q16](PRD.md#13-open-questions), proposed)

**Done when:** every allowed transition works from the right role across two devices, and the rest return 409.

### Phase 7: Payer dashboard (M10)
- [ ] **P7.1** Bills list, newest first, with collected, outstanding and confirmed count
- [ ] **P7.2** Bill detail: bill total, tips and card total at the top; each member's name, share, tip, method, status and actions
- [ ] **P7.3** Total still owed across all bills; flag totals that changed after payment (PRD Q7)

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
