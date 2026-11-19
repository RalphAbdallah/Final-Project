# splIT

Split a shared receipt in under a minute. One person pays and photographs the bill, everyone else scans a QR code, taps what they had, and the app tracks who has paid back (cash, Whish, OMT Pay, Neo, Suyool). Money moves outside the app; splIT records who owes what.

Capstone project for 020WBPES3 Web Programming, ESIB. Team: Ralph Abdallah, Charbel Harb, Jason Khadra.

> **Running it:** the app runs locally (instructions below). Deployment to Vercel and Render is set up (see [Deploying](#deploying)) but isn't live: the instructor allowed us to skip it for now.

## Features

- **Payer account:** sign up, log in, log out, change name, email and password, delete the account.
- **Get paid:** upload each wallet's receive-money QR code; the app reads the link inside it.
- **Bills from photos:** take one or more photos of the receipt. OpenAI copies what's printed; the app does every calculation. The payer checks and fixes the items before creating the bill.
- **Share:** a QR code and a link. Guests open it on their phone with no account, type a name, and claim what they had (one person per unit).
- **Fair split:** tax and service are spread in proportion to each person's items, rounded to the cent so the shares always add up to the bill.
- **Tips and paying:** each guest can add a tip, then picks cash or one of the payer's wallets (the wallet app opens on paying the payer, with the amount copied).
- **Payer dashboard:** every bill with what's collected and still owed; mark people as paid; claim your own items; lock tips once the card is charged.
- **No OpenAI key? Try a sample bill:** without a key, Home shows **Try a sample bill**, a ready-made bill with guests, so every feature except reading photos can still be tried.

## Stack

| Part | Choice |
| --- | --- |
| Front end | React with Vite, React Router, plain CSS |
| Back end | Node.js and Express, a REST API |
| Database | MongoDB with Mongoose (MongoDB Atlas, or a local MongoDB) |
| Auth | bcrypt password hashes and JWT tokens (`Authorization: Bearer ...`) |
| Third-party API | OpenAI (receipt reading), called from the server so the key stays secret |
| Tests | Server: Vitest, Supertest and an in-memory MongoDB. Client: Vitest and React Testing Library (jsdom) |
| Hosting (prepared) | Vercel (client), Render (server) |

## Architecture

```
 Phone / laptop browser
 ┌──────────────────────────┐   fetch /api/...    ┌──────────────────────────┐   Mongoose   ┌───────────┐
 │ React app (client/)      │ ──────────────────▶ │ Express API (server/)    │ ───────────▶ │  MongoDB  │
 │ pages, components,       │ ◀────────────────── │ routes → services →      │ ◀─────────── │           │
 │ AuthContext (JWT)        │   JSON              │ models                   │              └───────────┘
 └──────────────────────────┘                     │                          │   HTTPS      ┌───────────┐
                                                  │ services/openai.js       │ ───────────▶ │  OpenAI   │
                                                  └──────────────────────────┘              └───────────┘
```

The browser only talks to our API; the API is the only thing that touches the database or OpenAI.

```
splIT/
├── client/                 React app (Vite, port 5173)
│   └── src/
│       ├── api/client.js   apiFetch: base URL, token, errors; one function per request
│       ├── auth/           AuthContext: the logged-in payer's token, login, signup, logout
│       ├── pages/          one folder per area: auth, guest, payer (+ Home)
│       ├── components/     Sheet, Stepper, Toast, Amount, ...
│       ├── utils/          money, dates, the split engine copy, QR reading, photos
│       ├── styles/         design tokens and shared CSS
│       └── **/*.test.jsx   front-end tests, next to what they test
└── server/                 Express API (port 3000)
    ├── server.js           loads .env, connects to MongoDB, then listens
    ├── app.js              middleware and routes (the tests use it without a port)
    ├── models/             User, Bill (items, members and claims inside), Photo, AiUsage
    ├── routes/             auth, me, bills, receipts, share (guests)
    ├── middleware/         requireAuth, logger, rate limits
    ├── auth/token.js       sign and verify JWTs
    ├── services/           the split engine, views, receipt reading, limits
    └── tests/              API and unit tests (an in-memory MongoDB)
```

One request, end to end: a page calls `api.payerBill(id)` → `apiFetch` adds the token → `requireAuth` checks it and sets `req.user` → the route finds the bill with `{ _id, userId }` (another payer's bill is a 404) → the JSON comes back and the page re-renders.

All split and rounding logic lives on the server (`server/services/split.js`), in whole cents, never floats. The guest page previews a claim with an exact copy (`client/src/utils/split.js`, kept identical by a test); the server's answer always replaces it.

## Setup

You need **Node.js 22 or later** (24 LTS recommended) and a **MongoDB** database: either a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster, or MongoDB installed on your computer.

1. Install both parts: `npm run install:all`
2. Database, one of:
   - **Atlas:** create a database user, allow your IP under Network Access, and copy the connection string.
   - **Local MongoDB:** use `mongodb://127.0.0.1:27017/split`.
3. Copy `server/.env.example` to `server/.env` and fill in:
   - `MONGODB_URI`: the connection string from step 2
   - `JWT_SECRET`: a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `OPENAI_API_KEY`: optional. Without it, photos can't be read, and Home shows **Try a sample bill** instead, so everything else can still be tried
4. Start the server and the client, in two terminals:
   - `npm run dev:server` (API on http://localhost:3000)
   - `npm run dev:client` (app on http://localhost:5173; `/api` is forwarded to the server)

   On Windows, `start.bat` does both and opens the app in the browser.
5. Open http://localhost:5173, create an account, then tap **New bill** (with an OpenAI key) or **Try a sample bill** (without one).

To try it with friends on the same Wi-Fi, open the "Network" address Vite prints, so the QR code works on their phones.

**If the app shows `http proxy error ... ECONNREFUSED`:** the API isn't running. Look at the server's terminal: `DB connection failed` with Atlas usually means your current IP address isn't allowed. In Atlas, go to Network Access → Add IP Address → Add Current IP Address, wait until it's Active, then start the server again.

### Tests

`npm test` runs both sides (no database or OpenAI key needed):

- **Server** (`npm run test:server`): the API end to end with Supertest on an in-memory MongoDB (sign up and log in, ownership, guest flow, status changes, simultaneous claims, rate limits, receipt reading with a fake OpenAI), plus unit tests of the split engine and its rounding.
- **Client** (`npm run test:client`): React Testing Library tests of the claim stepper and the payer's Home page.

## Security

- Passwords are hashed with bcrypt (12 rounds); the hash never leaves the server.
- Payer routes need a valid JWT. Every query filters by the payer's id, so another payer's bill is a 404.
- Guests get a random 128-bit token per bill; share links use a random 128-bit token too.
- Every route validates and trims its input (lengths, types, ids, amounts) and answers 400 with an error code.
- Rate limits: login tries per email and per address, sign-ups per address, guest joins and claims, and OpenAI reads per payer and for everyone (`server/.env.example` lists them all).
- Secrets live only in `server/.env`, which is git-ignored; the OpenAI key never reaches the browser. CORS only allows the front end's address (`CLIENT_ORIGIN`).

## API

Payer routes need `Authorization: Bearer <token>`. Guest routes use the share token in the link, and an `X-Guest-Token` header once joined.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account → `{ token, user }` (201) |
| POST | `/api/auth/login` | Log in → `{ token, user }` |
| GET | `/api/me` | Profile, wallets and bills (the dashboard), and whether receipt reading is on |
| PATCH | `/api/me` | Change name or email |
| PATCH | `/api/me/password` | Change password (checks the current one) |
| DELETE | `/api/me` | Delete the account and everything in it (204) |
| PUT / DELETE | `/api/me/payouts/:wallet` | Save or remove a wallet link |
| POST | `/api/me/sample-bill` | Create a ready-made bill with guests (201) |
| POST | `/api/me/receipts/read` | Photos (base64) → a bill draft |
| GET | `/api/me/bills` | All the payer's bills |
| POST | `/api/me/bills` | Create a bill from the reviewed draft (201) |
| GET | `/api/me/bills/:id` | One bill: items, people, shares, totals |
| GET | `/api/me/bills/:id/photos` | The receipt photos |
| PATCH | `/api/me/bills/:id` | Edit venue, date, items, tax and service |
| DELETE | `/api/me/bills/:id` | Delete the bill (204) |
| PATCH / DELETE | `/api/me/bills/:id/members/:memberId` | Mark a guest paid or not / remove them |
| PUT / DELETE | `/api/me/bills/:id/claims/:itemId` | The payer's own claims |
| PUT | `/api/me/bills/:id/tip` | The payer's own tip |
| PUT | `/api/me/bills/:id/card-paid` | Lock (or unlock) tips once the card is charged |
| GET | `/api/share/:shareToken` | The bill as a guest sees it |
| POST | `/api/share/:shareToken/join` | Join with a name → `{ guestToken, ... }` (201) |
| PUT / DELETE | `/api/share/:shareToken/claims/:itemId` | Claim units of an item, or let them go |
| PATCH | `/api/share/:shareToken/me` | My tip and payment method |

Errors come back as JSON with a code: `{ "error": "not_enough_left" }`, with 400 (bad input), 401 (no or bad token), 403, 404, 409 (conflict), 429 (too many requests) or 500.

## Deploying

Prepared, not live yet (see the note at the top).

- **Server (Render):** root directory `server`, start command `npm start`. Set `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (the Vercel address) and `OPENAI_API_KEY`. In Atlas, allow access from anywhere (`0.0.0.0/0`), since Render's addresses change.
- **Client (Vercel):** root directory `client`. Set `VITE_API_URL` to the Render address. `client/vercel.json` sends every path to the app, so bill links work.
