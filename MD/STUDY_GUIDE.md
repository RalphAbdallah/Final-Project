# splIT: Study Guide

How to learn the whole codebase, one file at a time, before the demo on **Friday 20 November**.

The code follows the course slides (Sessions 1-22). Almost every file is a slide's pattern with different names, so for each file this guide tells you which session it comes from. The few things that go beyond the slides are listed at the end, with a one-line explanation each.

---

## How to use this guide

**The order.** Follow one request the way it travels (Session 20, "the full loop"): the server first, then the client's foundation, then the screens, one flow at a time. Each day builds on the one before.

**For every file, do the same five things:**

1. **Read the comments first.** Every file starts by saying what it does.
2. **Open the slide** named under "Course". Find the same pattern in the code.
3. **Read for** the points listed: they're what makes the file work.
4. **Try it:** add a `console.log`, or set a breakpoint (Session 12), then do the action in the app and watch.
5. **Check yourself:** answer the question out loud in two sentences. Can't? Re-read, or ask.

Tick each box when you can explain the file without looking.

**Before you start,** get the app running (see the README):

```
npm run dev:server     (terminal 1: the API on http://localhost:3000)
npm run dev:client     (terminal 2: the app on http://localhost:5173)
npm test               (the server tests: they should all pass)
```

### The map

```
Phone (React)                                    Server (Express)                 MongoDB Atlas
pages/... ──> api/client.js (apiFetch) ──HTTP──> app.js ──> middleware ──> routes ──> models ──> users, bills,
         <──  JSON, then React re-renders  <────────────────────────────────────────────────    photos, aiusages
```

- **Payer** (has an account): signs up, makes bills from receipt photos, shares a QR code, marks people paid.
- **Guest** (no account): opens the link, types a name, claims items, tips, pays outside the app.

---

## Day 1 · Friday 13: the server's skeleton (~200 lines)

Goal: you can explain everything that happens between "Sign up" and getting a token.

### 1. `server/server.js` · Session 18, slide 15
- [ ] **What it does:** loads `.env`, connects to MongoDB, then starts listening.
- **Read for:** `import 'dotenv/config'` on the first line (why first?); the loop that crashes at startup if `MONGODB_URI` or `JWT_SECRET` is missing (Session 21, slide 17); connect first, then `app.listen`.
- **Try it:** remove `MONGODB_URI` from `.env` and start the server. Read the message. Put it back.
- **Check yourself:** why does the server connect to the database before it listens?

### 2. `server/app.js` · Sessions 16, 17, 22
- [ ] **What it does:** builds the Express app: CORS, JSON parsing, the routes, the 404 and error handlers. It doesn't listen, so the tests can use it (Session 22, slide 16).
- **Read for:** `cors({ origin })` (Session 17, slides 16-17); two `express.json` limits (photos get 12 MB, everything else 100 KB); the tiny middleware that sets `req.body = {}`; `app.use('/api/me', requireAuth)` locks everything under `/api/me` (Session 19, slide 16); the order of `app.use` lines matters (Session 16, slide 15).
- **Try it:** visit http://localhost:3000/api/health and http://localhost:3000/api/nope.
- **Check yourself:** what happens to a request for `/api/me/bills` with no token? Which line stops it?

### 3. `server/middleware/logger.js` · Session 16, slide 16
- [ ] **What it does:** prints the time, method and path of every request.
- **Read for:** `next()`. What happens if you forget it?
- **Check yourself:** where does this run, before or after the routes?

### 4. `server/auth/token.js` · Session 19, slide 11
- [ ] **What it does:** `signToken(user)` makes a JWT that lasts 30 days; `verifyToken(token)` checks it (and throws if it's fake or expired).
- **Check yourself:** what's inside the token (`sub`)? Can someone read it? Can they change it?

### 5. `server/middleware/requireAuth.js` · Session 19, slide 16
- [ ] **What it does:** reads `Authorization: Bearer <token>`, verifies it, loads the user into `req.user`.
- **Read for:** the 401 cases (no token, bad token, deleted account); `try / catch` around `verifyToken`.
- **Check yourself:** after this middleware, what can every route use? (`req.user`, `req.userId`)

### 6. `server/models/User.js` · Session 18, slide 12; Session 19, slide 7
- [ ] **What it does:** the payer's account: name, email (unique, lowercase), `passwordHash`, and their wallet links (`payouts`).
- **Read for:** why `passwordHash` and never `password`; `payouts` is embedded in the user (Session 18, slide 13: "embed").
- **Check yourself:** why is the wallet list inside the user instead of its own collection?

### 7. `server/routes/auth.js` · Session 19, slides 13-14
- [ ] **What it does:** `POST /api/auth/signup` and `POST /api/auth/login`. Both answer with `{ token, user }`.
- **Read for:** validate → hash with `bcrypt.hash(password, 12)` → save → sign; login uses `bcrypt.compare`; one message for a wrong email *or* a wrong password (why?); `publicUser` never sends the hash.
- **Try it:** sign up in the app, then open the Network tab (Session 11) and find the `signup` request and its answer.
- **Check yourself:** what does the database store instead of the password, and how does login check it?

---

## Day 2 · Saturday 14: the data and how it's saved (~420 lines)

Goal: you can explain how a bill is stored and what happens when two phones change it at the same moment.

### 8. `server/models/Bill.js` · Session 18, slides 12-13
- [ ] **What it does:** one bill holds its `items`, `members` (everyone at the table, the payer included) and `claims` (who took how many of which item).
- **Read for:** money is always a whole number of cents (USD) or pounds (LBP); `members` order = join order; `shareToken` is the secret in the guest link; `optimisticConcurrency: true` (see file 12).
- **Check yourself:** why are items, members and claims inside the bill and not separate collections? (Hint: Session 18, "embed or reference".)

### 9. `server/models/Photo.js` and `server/models/AiUsage.js`
- [ ] **Photo:** a receipt photo as base64 text. Photos are big, so they get their own collection and the bill only keeps their ids ("reference").
- [ ] **AiUsage:** one row per receipt read, with its tokens, used to limit reading (file 20).
- **Check yourself:** why are photos *not* embedded in the bill like items are?

### 10. `server/services/text.js`
- [ ] Small helpers: `cleanText` ("  Ralph   Abdallah " → "Ralph Abdallah"), `isIsoDate`, `today`, `newToken` (a random 128-bit secret, Session 19, slide 11).
- **Check yourself:** why should a share link's token be long and random?

### 11. `server/services/sampleData.js` and `server/services/wallets.js`
- [ ] **sampleData:** a ready-made bill used by the tests (skim it).
- [ ] **wallets:** `checkPayUrl` accepts only `https` links on the wallet's own website (Whish: `whish.money`).
- **Check yourself:** what stops a payer from saving a link to a fake site as their Whish link?

### 12. `server/services/bills.js` ★ important
- [ ] **What it does:** `changeBill(filter, change)` reads a bill, lets `change(bill)` edit it, and saves it. `applyClaim` sets someone's units on an item (one person per unit). `nameTaken`, `createSampleBill`.
- **Read for:** in `changeBill`, if two phones save the same bill at the same moment, the slower save fails with a `VersionError` (that's `optimisticConcurrency`), so we read the bill again and redo the change (up to 3 tries). In `applyClaim`, `units > item.quantity - othersUnits` → 409 `not_enough_left`.
- **Try it:** read the test "keeps every claim when two guests claim at the same moment" in `tests/api.test.js`.
- **Check yourself:** what would go wrong without the retry? (Two guests claim at once and one claim disappears.)

### 13. `server/routes/me.js` · Session 19, slide 17
- [ ] **What it does:** the logged-in payer's account: `GET /api/me` (profile + bills = the dashboard), `PATCH /api/me` (name, email), `PATCH /api/me/password`, `DELETE /api/me`, wallet links (`PUT/DELETE /api/me/payouts/:wallet`), `POST /api/me/sample-bill`.
- **Read for:** `req.user` comes from `requireAuth`; the password change checks the current one with `bcrypt.compare`; renaming also renames the payer's row on each bill (with `changeBill`).
- **Check yourself:** why is there no `userId` in the URL? (It comes from the token, never from the request: Session 21, slide 12.)

### 14. `server/routes/share.js` · Sessions 16-17
- [ ] **What it does:** the guest routes: see the bill, join with a name, claim, set tip and payment method.
- **Read for:** `loadBill` and `requireMember` are middleware (Session 17, slide 10, like `requireTitle`); a guest is found by the `X-Guest-Token` header; guests can't mark themselves paid (403 `payer_only`).
- **Try it:** in the app, open a bill link in a private window, join, and watch the `join` request in the Network tab. Find `guestToken` in the answer and in Application → Local Storage.
- **Check yourself:** a guest has no account. How does the server know which member is calling?

---

## Day 3 · Sunday 15: the math and the bill routes (~900 lines)

Goal: you can split a bill by hand and get the same cents as the app.

### 15. `server/services/split.js` ★ important · Sessions 7, 9
- [ ] **What it does:** the split engine. `allocate` shares an amount by weights without losing a cent (floor everything, then give the leftover cents to the largest remainders). `computeSplit` gives every member their items, their share of tax and service, their tip, and what's still unclaimed.
- **Read for:** plain `for`, `map`, `reduce`, `forEach`; `BigInt` keeps huge LBP amounts exact (beyond the slides, see the end).
- **Try it:** read `tests/split.test.js` next to it. Each test is a small worked example.
- **Check yourself:** do PRD §8's example by hand (one $20 pizza shared by A, B and C: 6.67 + 6.67 + 6.66). Why do A and B get the extra cent?

### 16. `server/services/views.js`
- [ ] **What it does:** turns a bill into the JSON each screen needs: `billSummary` (one dashboard row), `guestView` (what a guest sees), `payerBillView` (the payer's bill screen).
- **Read for:** wallet links are only sent once a guest has joined; `money()` adds up collected and still owed; `changed` flags someone who paid before the bill changed.
- **Check yourself:** what does a guest see before joining that they don't see after, and the other way round?

### 17. `server/routes/bills.js` ★ important · Session 17 (CRUD), Session 19 (authorization)
- [ ] **What it does:** the payer's bills: list, create, read one, photos, edit, delete, mark a guest paid or not, remove a guest, the payer's own claims, tip, and "card paid".
- **Read for:** `validateBill` checks everything before saving (400 with a code); `ownBill(req)` puts `userId` in every filter, so someone else's bill is a 404 (Session 19, slide 17); the edit refuses a quantity below what's already claimed (409 `below_claims`); delete answers 204 with no body (Session 17, slide 9).
- **Try it:** in `api.test.js`, read "hides another payer's bill" and "edits items, keeps claims on kept items".
- **Check yourself:** why is another payer's bill a 404 and not a 403?

### 18. `server/services/draft.js`
- [ ] **What it does:** turns what the AI copied off a receipt into a bill draft. All the math is here, never in the AI: dollars to cents, unit price or line total, splitting $10.00 for 3 into 3.33 + 3.33 + 3.34, tax from a rate.
- **Try it:** read `tests/draft.test.js`: each test is one real receipt.
- **Check yourself:** why does the app, not the AI, do the calculations?

### 19. `server/routes/receipts.js` and `server/services/openai.js`
- [ ] **receipts.js:** `POST /api/me/receipts/read`: checks the limits, checks the photos, asks the AI, builds the draft, saves the photos, answers `{ draft, photos }`.
- [ ] **openai.js** (skim): one `fetch` to OpenAI from the server, so the key never reaches the browser (Session 11, slide 8; Session 20, slide 17). Read the `INSTRUCTIONS` rules; skim the schema.
- **Check yourself:** where is the OpenAI key, and why can't it be in the client?

### 20. `server/services/aiLimits.js` and `server/middleware/rateLimits.js`
- [ ] **aiLimits:** each payer can read 3 receipts an hour and 10 a day; a global budget protects the OpenAI credit. Counted from the `AiUsage` collection.
- [ ] **rateLimits:** limits on joining and claiming, counted in memory with a `Map` (Session 22, slide 11); past the limit, 429 with how long to wait.
- **Check yourself:** why are claim limits counted per guest, not per Wi-Fi address? (A whole table shares one Wi-Fi.)

### 21. The server tests · Session 22, slides 14-16
- [ ] `tests/db.js` starts a throwaway MongoDB for the tests. `tests/api.test.js` calls every route with `supertest`. `vi.mock` replaces the real OpenAI reader with a fake one, so tests are free.
- **Try it:** run `npm test`. Break something on purpose (change `>` to `>=` in `applyClaim`) and watch a test fail. Undo it.

---

## Day 4 · Monday 16: the client's foundation (~800 lines)

Goal: you can follow one click from a page, through `apiFetch`, to the server and back to the screen.

### 22. `client/src/main.jsx` and `client/src/App.jsx` · Session 13, slide 15; Session 22, slide 8
- [ ] **main.jsx:** one root, wrapped in `BrowserRouter` and `AuthProvider`.
- [ ] **App.jsx:** every page's URL (`Routes`, `Route`); `lazy` loads each page's code only when it's opened; `locked(...)` wraps the payer's pages in `RequireAuth`.
- **Check yourself:** which pages work without logging in?

### 23. `client/src/api/client.js` ★ important · Session 20, slide 9
- [ ] **What it does:** `apiFetch` adds the base URL and `Authorization: Bearer`, sends JSON, throws an error with a `code` when the answer isn't OK, and fires `auth:expired` on a 401. The `api` object has one function per request. Answers are also kept in `localStorage`, so screens reopen instantly.
- **Read for:** `try / catch` around `fetch` (offline → code `offline`); `res.ok` (Session 11, slide 13); `cachedBill`, `clearPayerCache`; `guestTokens` remembers each guest per bill.
- **Check yourself:** where does the token come from, and when is it sent?

### 24. `client/src/auth/AuthContext.jsx` · Session 15, slides 18-19; Session 20, slides 12-14
- [ ] **What it does:** keeps the token in `useState` and `localStorage` (in sync), gives `login`, `signup`, `logout` to every component, logs out on `auth:expired`. `RequireAuth` shows the log-in form in place of a locked page; after logging in, the page appears.
- **Check yourself:** why keep the token in both `useState` and `localStorage`?

### 25. `client/src/pages/auth/AuthPage.jsx` · Session 15, slides 9-10
- [ ] **What it does:** log in and sign up on one screen.
- **Read for:** one state object for all fields with `[name]: value` (Session 15, slide 9); checks before sending; after sign-up, it goes to "How do you get paid".
- **Check yourself:** what happens on screen when the password is wrong? Follow it from the server's 401 to the red message.

### 26. `client/src/pages/Home.jsx`
- [ ] **What it does:** the landing page when logged out; the dashboard when logged in: "Still owed to you", the list of bills, and New bill (opens the camera).
- **Read for:** the screen starts from the remembered profile, then refreshes; New bill shrinks the photo and saves it for the new-bill screen (`newBillStore`).

### 27. Small components (read quickly)
- [ ] `Loading.jsx` (spinner), `Avatars.jsx` (initials), `StatusChip.jsx` (Paid / Unpaid), `WalletLogo.jsx`, `PasswordInput.jsx` (the eye button), `Amount.jsx` (big amount with small cents; long amounts get smaller via `--chars`), `Stepper.jsx` (− count +), `Toast.jsx` (a message that disappears by itself, with `setTimeout`, Session 10).
- `Icon.jsx` is just SVG drawings: skip it.

### 28. Utils (read quickly)
- [ ] `money.js` (format and parse amounts; everything is in cents), `dates.js`, `people.js` (initials, avatar colors), `wallets.js` (names, logos, steps).
- **Check yourself:** why are amounts stored as `1750` and not `17.5`? (Decimals in JavaScript aren't exact.)

---

## Day 5 · Tuesday 17: the guest flow (~950 lines)

Goal: you can explain everything a guest does, from scanning the QR code to paying.

### 29. `client/src/components/Sheet.jsx` ★ important · Session 6 (transitions, keyframes), Session 8 (events)
- [ ] **What it does:** the bottom sheet used everywhere. It slides up with a CSS animation, slides down when closed, and can be dragged down to close.
- **Read for:** `mounted` and `closing` states (open → on the page; closed → slide away first, then remove); `onAnimationEnd` removes it after the slide; pointer events for the drag (closes past 120 px or on a fast flick); the CSS is in `components.css` (`@keyframes sheet-up` and `sheet-down`).
- **Check yourself:** why can't the sheet just disappear when `open` becomes false?

### 30. `client/src/components/ItemRow.jsx`
- [ ] One item to claim: name, price, who has it (avatars), and Claim or − count +. `myMax` = what nobody else has claimed.

### 31. `client/src/utils/preview.js` and `client/src/utils/split.js`
- [ ] **split.js** is an exact copy of the server's engine (a test checks they're identical). **preview.js** uses it to show the new total the moment you tap; the server's answer replaces it a moment later.
- **Check yourself:** why show a preview instead of waiting for the server?

### 32. `client/src/pages/guest/GuestBill.jsx` ★ important · Sessions 14-15
- [ ] **What it does:** the guest's page: the bill, the join form, claiming, and Done.
- **Read for:** `phase` (loading, missing, error, ready); `load()` plus a `setInterval` refresh every few seconds while the page is visible (Session 10); `mutate` shows the change at once, then keeps only the newest answer (`requests.latest`); "Not you?" forgets the guest token.
- **Try it:** open the same bill in two windows as two guests. Claim in one and watch the other update.
- **Check yourself:** two answers come back out of order. Which one is shown, and how does the code know?

### 33. `client/src/pages/guest/PayFlow.jsx`
- [ ] **What it does:** after Done: the tip step, then the pay step, in one sheet. `useTip` is a custom hook (Session 20, slide 10). The pay step shows the amount, Copy amount, and the payment methods; a wallet opens the payer's own link.
- **Check yourself:** why can't the app put the amount inside the Whish link? (Only merchants can; see PRD R1.)

### 34. `client/src/utils/clipboard.js`
- [ ] Copies text with `navigator.clipboard`, and an older way when that's not available (plain `http`).

---

## Day 6 · Wednesday 18: the payer flow (~2,400 lines, the biggest day)

Goal: you can explain a bill from photo to QR code to marking someone paid.

### 35. `client/src/pages/payer/GetPaid.jsx` and `client/src/utils/qr.js`
- [ ] **What it does:** pick your wallets, follow the steps, upload each wallet's QR image. `qr.js` reads the link inside the picture (`jsqr`); the server checks it's on the right website.
- **Check yourself:** where is the QR code read, on the phone or on the server?

### 36. `client/src/pages/payer/NewBill.jsx` ★ the longest file · with `utils/images.js` and `utils/newBillStore.js`
- [ ] **What it does:** photos → the AI reads them → the payer checks and fixes everything → Create bill.
- **Read for:** `images.js` shrinks each photo to at most 1600 px and turns it into text (a data URL); `newBillStore.js` keeps the bill in progress in `localStorage`, so a reload doesn't lose it; `read()` reuses the last result if the photos didn't change; `switchCurrency` converts at the exchange rate and can undo exactly; `ItemSheet` and `ExtrasSheet` are reused by EditBill.
- **Tip:** read it in three passes: (1) the photo step (`PhotoStep`), (2) `read()` and `create()`, (3) the review screen and its sheets.

### 37. `client/src/pages/payer/ShareBill.jsx`
- [ ] A big QR code of the guest link (`QRCode.toDataURL` makes it a picture), Copy link, and the phone's share sheet (`navigator.share`).

### 38. `client/src/pages/payer/BillScreen.jsx` ★ important
- [ ] **What it does:** the payer's bill: the total to charge, everyone's share and status, Mark as paid, remove a guest, the payer's own items and tip, the receipt photos, and Submit (locks tips once the card is charged).
- **Read for:** the same `load` / refresh / `mutate` pattern as GuestBill; photos load once with `api.billPhotos`, not on every refresh.

### 39. `client/src/pages/payer/EditBill.jsx`
- [ ] Edit a bill after creating it, reusing NewBill's sheets. Can't lower a quantity below what's claimed. Delete asks once more.

### 40. `client/src/pages/payer/Profile.jsx`
- [ ] Name, email, password and delete account, each in a sheet; Log out.

### 41. CSS (skim)
- [ ] `styles/tokens.css` (every color, size and spacing as a variable, Session 6), `styles/layout.css` and `base.css` (shared screens and buttons), `components/components.css` (the sheet's `@keyframes`), and one file per page. The design rules are in `MD/DESIGN.md`.

---

## Day 7 · Thursday 19: review and practice

- [ ] Read the README once: it's your architecture summary.
- [ ] Go through **Beyond the slides** below; say one sentence for each.
- [ ] Prepare the 5-8 minute demo (Session 17, slide 25):
  1. **The problem:** one person pays the whole bill and chases everyone for weeks.
  2. **A live walkthrough:** photo → check the bill → QR → a friend claims on their phone → tip → pay → Mark as paid.
  3. **One technical challenge:** two phones claiming at the same moment (`changeBill` retries), or making the split always add up to the cent (`allocate`).
  4. **What you'd build next:** live updates instead of refreshing, payment proof screenshots, reminders.
- [ ] Wake the Render server a minute before the demo (it sleeps when unused).

---

## Beyond the slides: one sentence each

These are the only parts the slides don't show. Learn what each one is for; you don't need to know how they work inside.

| What | Where | In one sentence |
| --- | --- | --- |
| `Link`, `useNavigate`, `useParams` | most pages | From the same library as `Routes`: a link without reloading, going to a page from code, and reading `:id` from the URL. |
| `new Bill()`, `.save()`, `optimisticConcurrency` | `services/bills.js`, `models/Bill.js` | Load a bill, change it, save it; if someone else saved it in between, the save fails and we retry. |
| `.limit()`, `deleteMany`, `$gte` | `routes/me.js`, `routes/bills.js`, `services/aiLimits.js` | At most 50 bills; delete all of one account's data; "created since this time". |
| `const [box] = useState({...})` | six pages | Keeps a value between renders without redrawing the screen when it changes (React's tool for this, `useRef`, isn't in the slides). |
| `BigInt` | `split.js` | Whole numbers of any size, so huge LBP amounts stay exact. |
| `qrcode`, `jsqr` | `ShareBill.jsx`, `utils/qr.js` | Draw a QR code; read one from a picture. |
| Canvas (`new Image`, `getContext`, `toDataURL`) | `utils/images.js`, `utils/qr.js` | Draw the photo smaller, then get it back as JPEG text. |
| `navigator.clipboard`, `navigator.share`, `execCommand` | `utils/clipboard.js`, `ShareBill.jsx` | Copy text; open the phone's share sheet. |
| `<dialog>`, `showModal()` | `Sheet.jsx` | A built-in pop-up: handles Escape, focus, and the page behind. |
| Pointer events, `setPointerCapture` | `Sheet.jsx`, `PasswordInput.jsx` | Like `onClick` for a finger moving; capture keeps the moves coming while dragging. |
| `elementFromPoint`, `getComputedStyle` | `Sheet.jsx` | An iPhone fix: find the color at the top of the screen so the status bar matches. |
| `document.visibilityState` | `BillScreen.jsx`, `GuestBill.jsx` | Only refresh while the screen is actually visible. |
| `AbortSignal.timeout` | `services/openai.js` | Stop waiting for OpenAI after 60 seconds. |
| `Intl.NumberFormat`, `Intl.DateTimeFormat` | `utils/money.js`, `utils/dates.js` | Format "$1,234.50" and "Tue 3 Nov". |
| `res.set('Retry-After', ...)` | `rateLimits.js`, `routes/receipts.js` | A header telling the phone how many seconds to wait. |
| `encodeURIComponent` | `api/client.js` | Puts an id in a URL safely. |
| Small built-ins | everywhere | `replaceAll`, `padStart`, `toFixed`, `toLocaleString`, `Number.isInteger`, `.at(-1)`, `Object.entries`: each does what its name says. |
| CSS layout | all `.css` files | `position`, `inset`, `z-index`, `overflow` place sheets and sticky bars; `calc()`, `min()`, `env(safe-area-inset-...)` keep things off the iPhone's notch and home bar; `dvh` is the screen's height. |
| CSS look | all `.css` files | `oklch()` colors, `backdrop-filter` (the toast's blur), `color-mix()`, `cubic-bezier()` (the sheet's motion), `prefers-reduced-motion` (no animations for people who turned them off). |
| Tests only | `tests/` | `vi.mock` swaps in a fake OpenAI reader; `mongodb-memory-server` is a throwaway database. |
