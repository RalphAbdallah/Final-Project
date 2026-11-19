# splIT: Demo and presentation (Session 24)

5 to 8 minutes, then Q&A. The brief asks for four things, in this order: **the problem**, **a live walkthrough of the key features**, **one technical challenge we overcame**, and **what we'd build next**. The app runs on the laptop (deployment is skipped for now, with the instructor's OK).

## Before the session (15 minutes before)

- [ ] `server/.env` has `MONGODB_URI`, `JWT_SECRET` and `OPENAI_API_KEY`. Check the OpenAI credit. Without a key, use **Try a sample bill** instead of a photo.
- [ ] Laptop and every demo phone on the **same Wi-Fi** (a phone hotspot is the safest: classroom Wi-Fi often blocks phone-to-laptop traffic).
- [ ] **Atlas → Network Access: allow the network you'll present on** (Add Current IP Address on the classroom or hotspot network, or `0.0.0.0/0`). A new network isn't allowed by default: the server stops with "DB connection failed" and the app shows `http proxy error ... ECONNREFUSED`.
- [ ] Run `start.bat` (or `npm run dev:server` and `npm run dev:client`). The server window must say `connected to MongoDB`. Open the **Network** address Vite prints (e.g. `http://192.168.x.x:5173`) on the laptop, so the QR code points at an address the phones can reach.
- [ ] Log in to the payer account. Have one bill already made (the backup if reading is slow), and the paper receipt (or `Receipts/Castle.jpeg` on screen) ready to photograph.
- [ ] Two teammates' phones ready to scan, with their browser open.
- [ ] `npm test` passes (82 server + 10 client tests), in case we're asked to show tests.
- [ ] Laptop on charge, notifications off, browser zoom up so the room can read it.

## Who does what

| Part | Time | Who |
| --- | --- | --- |
| 1. The problem | 0:45 | Ralph |
| 2. Live walkthrough | 4:00 | Ralph drives the laptop; Charbel and Jason are the guests on their phones |
| 3. Technical challenge | 1:30 | Charbel |
| 4. What's next | 0:45 | Jason |

(Swap names as the team prefers; the point is that everyone speaks.)

## 1. The problem (45 s)

> Four friends at dinner. One pays with a card. Then come the hard parts: shared dishes, 11% tax and a service charge that have to be spread fairly, tips, and prices in dollars and lira. And then the person who paid spends a week chasing people on WhatsApp, with no record of who has paid. The friends won't install an app or make an account to settle one dinner, and they pay back with cash, Whish or OMT, not bank cards.
>
> splIT: the payer photographs the receipt, everyone else scans a QR code, taps what they had, and the app tracks who has paid back.

## 2. Live walkthrough (4 min)

1. **Payer account** (laptop): show we're logged in; open Profile → payment methods (Whish link read from a QR code image).
2. **New bill from a photo**: New bill → photo of the receipt → *Read receipt*. While it reads: "OpenAI only *copies* what's printed into a strict JSON schema; every calculation is done by our code." Show the review screen: fix an item, show tax and service.
3. **Share**: create the bill → the share screen's QR code.
4. **Guests join** (phones): Charbel and Jason scan the QR code, type a name. No account, nothing installed.
5. **Claim at the same moment**: both claim items at the same time, including units of the same dish ("2 of the 5 pizzas"). Their totals, with their share of tax and service, update on every tap. One of them tries to take the last unit the other already has: "Someone just claimed that one."
6. **Tip and pay**: Done → add a tip → pick Whish: the amount is shown large and copied; *Open Whish* opens the payer's own link.
7. **Payer dashboard** (laptop): the bill shows each person's share, tip and status; the card total = bill + tips. Mark Charbel as paid; Home's "Still owed to you" goes down.

If the reading is slow or fails: "OpenAI's latency varies; here's one we made earlier" and open the prepared bill.

## 3. Technical challenge (1 min 30 s)

**Three phones claiming on the same bill at the same moment, without losing anyone's claim.**

> A bill is one MongoDB document with its items, members and claims inside. If two phones read the bill, each adds a claim, and both save, the second save overwrites the first, and a claim silently disappears. Or worse, two people both get the last pizza.
>
> We turned on Mongoose's `optimisticConcurrency` on the Bill schema. Every save checks the version number it read; if someone saved in between, our save fails with a `VersionError` instead of overwriting. `changeBill()` in `server/services/bills.js` catches that, reads the fresh bill, and applies the change again (up to 3 tries). The "one person per unit" rule is checked on that fresh copy, so only one phone can get the last unit; the other gets a 409 `not_enough_left`. There is a test that fires claims at the same time and checks none are lost.

Backup challenge, if asked for another: **rounding**. Tax and service are spread in proportion, which gives fractions of a cent. We work in whole cents and use the largest remainder method, so the shares always add up exactly to the bill. A test checks that on random bills.

## 4. What we'd build next (45 s)

- **Live updates** with Socket.io: today screens poll every few seconds; a room per bill would push each claim instantly.
- **USD and LBP side by side**: the payer sets the rate; everyone sees their share in both.
- **Payment proof**: attach the Whish or OMT transfer screenshot when paying.
- **Deploying it** (Vercel + Render are already set up in the README) and a real-phone accessibility pass.

## Q&A: likely questions

| Question | Short answer |
| --- | --- |
| How are passwords stored? | bcrypt hashes (12 rounds); the hash never leaves the server. Login answers the same error for a wrong email or password. |
| How do you protect routes? | JWT in `Authorization: Bearer`. `requireAuth` checks it on everything under `/api/me`. Every query filters by the payer's id, so another payer's bill is a 404, not a 403: we don't reveal it exists. |
| How do guests work without accounts? | The link holds a random 128-bit share token; joining gives a random 128-bit guest token, kept in the browser's localStorage and sent as `X-Guest-Token`. |
| What stops abuse? | Rate limits on login (per email and per address), joining and claiming, and caps on OpenAI reads per payer and for everyone. Every route validates its input. |
| Can the AI get the math wrong? | It doesn't do math. It copies printed values into a strict schema; `services/draft.js` computes unit prices and splits uneven lines. The payer reviews before creating. |
| Where are the secrets? | `server/.env`, git-ignored. The OpenAI key never reaches the browser; only `VITE_API_URL` is in the client. |
| What do the tests cover? | Server: the API end to end with Supertest on an in-memory MongoDB, plus the split engine. Client: React Testing Library tests of the claim stepper and Home. |
| Why MongoDB? | A bill with its items, members and claims is read and written as one document, which is how every screen uses it. |
| Why isn't it deployed? | The instructor allowed us to skip it for now; the README has the Vercel and Render steps. |
