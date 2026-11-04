# splIT

Receipt-splitting web app; capstone for 020WBPES3 Web Programming, ESIB. Team: Ralph Abdallah, Charbel Harb, Jason Khadra.

## Project docs: the source of truth

@MD/PRD.md
@MD/PLAN.md
@MD/DESIGN.md

These live in `MD/` and load at session start. They change between iterations, so re-read them at the start of every iteration anyway. New project docs (including impeccable's `PRODUCT.md`) go in `MD/` too.

- **MD/PRD.md**: what to build and the rules it must follow (split math, payment states, security).
- **MD/PLAN.md**: order of work, current status, decisions, iteration log.
- **MD/DESIGN.md**: the visual system. Empty until Phase D.
- `splIT_proposal.md` (root) is the submitted proposal. Read-only: never edit it.

If a request conflicts with the PRD, say so before building. Items marked "(proposed)" or listed as open questions in the PRD aren't settled; flag them when a task depends on one.

## Iteration protocol

**Before**
1. Read MD/PRD.md, MD/PLAN.md and MD/DESIGN.md.
2. Take the next unchecked task(s) in PLAN.md's current phase, unless the user asked for something else. State the goal and task IDs in one or two lines.
3. If the task touches UI, load the design language below first.

**After**
4. Verify: run the relevant tests; for UI, check it at phone width (about 390 px).
5. Update PLAN.md: tick tasks, add an Iteration log row, record decisions and new open questions, update the status line.
6. If behavior or scope changed, update PRD.md in the same iteration.

## Design language (default for all UI work)

Invoke both skills with the Skill tool before any iteration that designs, builds or reviews UI:

- **`impeccable`**: the design process and quality bar. Color, typography, layout, UX copy, anti-patterns, and the `critique`, `audit`, `polish`, `harden` commands.
- **`apple-design`**: how things feel. Instant press feedback, springs, interruptible transitions, gestures and sheets, materials, typographic detail.

Precedence: DESIGN.md (once written) > references in `inspo/` > skill defaults.

Where the two skills pull in different directions:
- **Motion:** springs default to no bounce (critically damped). A little bounce only after a momentum gesture, such as a flicked sheet. Non-gesture transitions ease out exponentially. Every animation has a `prefers-reduced-motion` alternative.
- **Translucency:** only on floating chrome that content scrolls under (sticky header, bottom sheet, tab bar). No decorative glass cards. Respect `prefers-reduced-transparency`.

Project specifics:
- Expected register: **product** (app UI, not a marketing site). Confirm during `/impeccable init`.
- `MD/PRODUCT.md` doesn't exist yet, on purpose. impeccable needs it, so the first design iteration runs `/impeccable init` (PLAN D.2), drawing users and purpose from PRD.md and personality from `inspo/`. Write it to `MD/`, not the root.
- impeccable finds `MD/` through `IMPECCABLE_CONTEXT_DIR=MD`, set in `.claude/settings.json`. Its scripts are installed per user, in `~/.claude/skills/impeccable/scripts/`, not inside this project.
- Until DESIGN.md is written, build screens structurally (semantic HTML, minimal layout CSS) and make no visual-style decisions.

## Stack and conventions

- The project is two independent npm projects, each with its own `node_modules` and lockfile: `frontend/` and `backend/`. No workspaces, nothing installed at the root. Root shortcuts: `npm run install:all`, `npm run dev:backend` and `npm run dev:frontend` (two terminals), `npm test`, `npm run build`.
- `frontend/`: React (Vite) and **plain CSS**. No Tailwind, CSS-in-JS or component kits. Design tokens are CSS custom properties in `frontend/src/styles/tokens.css`.
- Database: Supabase Postgres via `DATABASE_URL` in `backend/.env`. `npm run db:check` tests the connection; `npm run db:migrate` applies new files in `backend/src/db/migrations/` (never edit an applied migration; add a new numbered file). Every table has row level security on with no policies, so only the backend can reach data; keep it that way for new tables.
- `backend/`: Node.js and Express REST API. All split and rounding logic lives in `backend/src/split/`. One exception (team decision, 3 November 2026): the guest page previews a claim instantly with an exact copy of the engine, `frontend/src/lib/split.js`; display only, the server's answer replaces it. After changing `backend/src/split/index.js`, copy it over (`split/copy.test.js` fails until you do). Routes take a `repo` (data access): `repo/postgres.js` in the app, `repo/memory.js` in tests, with the same methods; add new data access to both. Payer routes require a Supabase access token (`src/auth.js`); tests inject a fake `verifyToken`.
- Receipt reading (PRD M2): the AI (`backend/src/receipts/openai.js`) only copies printed values into a strict JSON schema; every calculation lives in `receipts/draft.js` and is unit-tested against the receipts in `Receipts/`. Never move math into the prompt. Real reads cost OpenAI credit: test with the fake reader in `app.test.js`.
- Frontend auth: Supabase client (`lib/supabase.js`) only for sign-in, loaded on payer pages only (`pages/PayerArea.jsx`); payer API calls attach the token via `setTokenSource`. Guest pages must not import `lib/auth.jsx` or `lib/supabase.js`.
- npm on Windows used to drop Rolldown's native build (used by Vite and Vitest) on incremental installs ("Cannot find native binding"). It's now pinned in `optionalDependencies` of both packages; when Vite or Vitest is upgraded, update that pin to the new `rolldown` version. Fallback: delete `node_modules` and `package-lock.json` in that folder, then `npm install`.
- Supabase: Postgres, Auth (payer only), Storage. The browser uses Supabase **only for auth**; every data read and write goes through Express.
- Money is integer minor units in code (cents for USD, whole pounds for LBP). Never floats.
- Mobile first: the guest flow happens on phones at the table.
- Secrets live in `.env` files, never committed. The OpenAI key stays on the server.
