# splIT

Split a shared receipt in under a minute. One person pays and photographs the bill, everyone else scans a QR code, taps what they had, and the app tracks who has paid back (cash, Whish, OMT Pay, Neo, Suyool). Money moves outside the app; splIT records who owes what.

Capstone project for 020WBPES3 Web Programming, ESIB. Team: Ralph Abdallah, Charbel Harb, Jason Khadra.

## Features

- **Payer account:** sign up, log in, log out, change name, email and password, delete the account.
- **Get paid:** upload each wallet's receive-money QR code; the app reads the link inside it.
- **Bills from photos:** take one or more photos of the receipt. OpenAI copies what's printed; the app does every calculation. The payer checks and fixes the items before creating the bill.
- **Share:** a QR code and a link. Guests open it on their phone with no account, type a name, and claim what they had (one person per unit).
- **Fair split:** tax and service are spread in proportion to each person's items, rounded to the cent so the shares always add up to the bill.
- **Tips and paying:** each guest can add a tip, then picks cash or one of the payer's wallets (the wallet app opens on paying the payer, with the amount copied).
- **Payer dashboard:** every bill with what's collected and still owed; mark people as paid; claim your own items; lock tips once the card is charged.

## Stack

| Part | Choice |
| --- | --- |
| Front end | React with Vite, React Router, plain CSS |
| Back end | Node.js and Express, a REST API |
| Database | MongoDB Atlas with Mongoose |
| Auth | bcrypt password hashes and JWT tokens (`Authorization: Bearer ...`) |
| Third-party API | OpenAI (receipt reading), called from the server so the key stays secret |
| Tests | Vitest and Supertest (server) |
| Hosting | Vercel (client), Render (server) |

## Architecture

```
splIT/
├── client/                 React app (Vite, port 5173)
│   └── src/
│       ├── api/client.js   apiFetch: base URL, token, errors; one function per request
│       ├── auth/           AuthContext: the logged-in payer's token, login, signup, logout
│       ├── pages/          one folder per area: auth, guest, payer
│       ├── components/     Sheet, Stepper, Toast, Amount, ...
│       ├── utils/          money, dates, the split engine copy, QR reading, photos
│       └── styles/         design tokens and shared CSS
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

## Setup

You need Node.js 22 or later and a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

1. Install both parts: `npm run install:all`
2. In Atlas: create a database user, allow your IP under Network Access, and copy the connection string.
3. Copy `server/.env.example` to `server/.env` and fill in:
   - `MONGODB_URI`: the Atlas connection string
   - `JWT_SECRET`: a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `OPENAI_API_KEY`: optional; without it, everything works except reading receipt photos
4. Start the server and the client, in two terminals:
   - `npm run dev:server` (API on http://localhost:3000)
   - `npm run dev:client` (app on http://localhost:5173; `/api` is forwarded to the server)
5. Run the tests: `npm test`

To try it with friends on the same Wi-Fi, open the "Network" address Vite prints, so the QR code works on their phones.

## API

Payer routes need `Authorization: Bearer <token>`. Guest routes use the share token in the link, and an `X-Guest-Token` header once joined.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/signup` | Create an account → `{ token, user }` (201) |
| POST | `/api/auth/login` | Log in → `{ token, user }` |
| GET | `/api/me` | Profile, wallets and bills (the dashboard) |
| PATCH | `/api/me` | Change name or email |
| PATCH | `/api/me/password` | Change password (checks the current one) |
| DELETE | `/api/me` | Delete the account and everything in it (204) |
| PUT / DELETE | `/api/me/payouts/:wallet` | Save or remove a wallet link |
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

- **Server (Render):** root directory `server`, start command `npm start`. Set `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (the Vercel address) and `OPENAI_API_KEY`. In Atlas, allow access from anywhere (`0.0.0.0/0`), since Render's addresses change.
- **Client (Vercel):** root directory `client`. Set `VITE_API_URL` to the Render address. `client/vercel.json` sends every path to the app, so bill links work.
