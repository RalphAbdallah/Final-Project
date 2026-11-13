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
- `MD/splIT_proposal.md` is the submitted proposal. Read-only: never edit it.

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

**Course-only code (team rule since 12 November 2026):** the teacher requires that the team understands every line, so all code uses the patterns from the course slides (`../Cours/`, Sessions 1-22) and the capstone architecture they describe. Allowed extras beyond the slides, because a feature needs them: `Link`/`useNavigate`/`useParams`, `qrcode` and `jsqr`, canvas photo shrinking, clipboard and share, pointer events (sheet drag), CSS `position`/`overflow`/`z-index`/`calc`/`env`, `<dialog>`. Don't add other libraries or patterns (no `useRef`, `useId`, `useMemo`, `??`, classes, regex where string methods do); when a value must survive renders without re-rendering, the code uses `const [box] = useState({ ... })` and changes its fields. Keep the UI exactly as it is.

- Two independent npm projects, each with its own `node_modules` and lockfile: `client/` and `server/`. Root shortcuts: `npm run install:all`, `npm run dev:server` and `npm run dev:client` (two terminals), `npm test`, `npm run build`.
- `client/`: React (Vite) and **plain CSS**. `src/api/client.js` (apiFetch: base URL, token, errors, the localStorage cache), `src/auth/AuthContext.jsx` (token in localStorage; `RequireAuth` shows the log-in form in place of a locked page), `src/pages/`, `src/components/`, `src/utils/`. Design tokens are CSS custom properties in `client/src/styles/tokens.css`. Animations are CSS transitions and keyframes (no animation library).
- `server/`: Node.js and Express. `server.js` (dotenv, connect to MongoDB, listen) and `app.js` (exported app, no port). `models/` (Mongoose: User, Bill with items/members/claims embedded, Photo, AiUsage), `routes/` (auth, me, bills, receipts, share), `middleware/` (requireAuth, logger, rateLimits), `auth/token.js` (JWT), `services/` (split engine, views, OpenAI reader, draft math, AI limits), `tests/`.
- Database: MongoDB Atlas via `MONGODB_URI` in `server/.env`. Bills are changed with `changeBill()` (`services/bills.js`): read, change, save; the schema's `optimisticConcurrency` makes a colliding save fail and it retries, so simultaneous claims are never lost.
- Auth: bcrypt hashes and JWT (`JWT_SECRET`), `Authorization: Bearer <token>`. Every payer query filters by `userId` (another payer's bill is a 404). Guests have no account: the share token picks the bill, `X-Guest-Token` picks the member.
- All split and rounding logic lives in `server/services/split.js`. The guest page previews a claim with an exact copy, `client/src/utils/split.js`; after changing the server's, copy it over (`tests/copy.test.js` fails until you do).
- Receipt reading (PRD M2): the AI (`services/openai.js`) only copies printed values into a strict JSON schema; every calculation lives in `services/draft.js`. Never move math into the prompt. Real reads cost OpenAI credit: the tests use a fake reader (`vi.mock` in `tests/api.test.js`).
- Receipt photos travel and are stored as base64 text (Photo collection); the bill keeps their ids.
- Money is integer minor units in code (cents for USD, whole pounds for LBP). Never floats.
- Mobile first: the guest flow happens on phones at the table.
- Secrets live in `.env` files, never committed. The OpenAI key stays on the server.
- Tests: `npm test` in `server/` starts a throwaway in-memory MongoDB (`tests/db.js`).
