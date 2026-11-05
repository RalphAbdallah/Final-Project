---
name: splIT
description: Split a shared receipt in under a minute, settle up in your own wallet app.
colors:
  night: "oklch(0.13 0 0)"
  night-raised: "oklch(0.21 0 0)"
  night-line: "oklch(0.30 0 0)"
  night-ink: "oklch(0.98 0 0)"
  night-muted: "oklch(0.72 0 0)"
  day: "oklch(1 0 0)"
  day-sunken: "oklch(0.965 0 0)"
  day-line: "oklch(0.91 0 0)"
  ink: "oklch(0.17 0 0)"
  ink-muted: "oklch(0.47 0 0)"
  lime: "oklch(0.90 0.18 124)"
  lime-press: "oklch(0.84 0.18 124)"
  lime-ink: "oklch(0.22 0.05 124)"
  lime-deep: "oklch(0.48 0.13 128)"
  lime-soft: "oklch(0.96 0.06 124)"
  status-unpaid: "oklch(0.78 0.15 70)"
  status-marked: "oklch(0.62 0.17 255)"
  status-confirmed: "oklch(0.66 0.16 150)"
  danger: "oklch(0.55 0.23 29)"
  wallet-whish: "oklch(0.60 0.21 18)"
  wallet-omt: "oklch(0.87 0.17 95)"
  wallet-neo: "oklch(0.55 0.16 265)"
  wallet-suyool: "oklch(0.70 0.13 200)"
typography:
  amount:
    fontFamily: "system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
  label:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
  caption:
    fontFamily: "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
rounded:
  chip: "8px"
  card: "20px"
  sheet: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
    height: "52px"
    padding: "0 24px"
  button-primary-active:
    backgroundColor: "{colors.lime-press}"
  button-night:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
    height: "44px"
    padding: "0 18px"
  button-day:
    backgroundColor: "{colors.day-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
    height: "44px"
    padding: "0 18px"
  sheet:
    backgroundColor: "{colors.day}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  stepper:
    backgroundColor: "{colors.day-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "36px"
  chip-claimed:
    backgroundColor: "{colors.lime-soft}"
    textColor: "{colors.lime-deep}"
    rounded: "{rounded.chip}"
    typography: "{typography.caption}"
  wallet-card:
    rounded: "{rounded.card}"
    width: "72px"
    height: "112px"
---

# Design System: splIT

## Overview

**Scene:** four friends at a dim restaurant table late at night, phones out under low warm light, one of them waiting for the others to tap what they ate before the waiter brings the card machine.

That scene sets the theme: a **near-black top** carries the one number that matters (your share), readable at a glance in low light, and a **white sheet** slides up over it with the item list, where scanning and tapping happen. It's the wallet-app pattern from the inspo, applied to a receipt. Payer screens that are mostly lists (bills, members, statuses) sit on the light surface, with a colored status timeline from the second inspo image.

Color strategy: **Restrained**. Pure neutrals (chroma 0) plus one accent, **lime**, used only for the primary action, claimed state and progress. Wallet colors appear only on wallet cards. Product register: one system font, fixed rem scale, consistent components, motion only to show a change of state.

## Colors

All colors are OKLCH; the frontmatter is the source of truth and `frontend/src/styles/tokens.css` mirrors it.

- **Night** surfaces (`night`, `night-raised`, `night-line`) and text (`night-ink`, `night-muted`) for the dark top and dark pills. Pure neutral, no tint.
- **Day** surfaces (`day` pure white for sheets, `day-sunken` for page backgrounds, steppers and pressed rows, `day-line` for hairlines) with `ink` and `ink-muted` text (6.8:1 on white).
- **Lime** is the accent. `lime` fills primary buttons with dark `lime-ink` text (pale fill, so dark text). `lime-soft` tints claimed rows and chips; `lime-deep` is the only lime allowed as text or icon on white (6.5:1). Never lime text on white, never lime on inactive things. A text field being typed in gets a lime ring on dark and white screens alike (team choice, 2026-11-03); buttons focused by keyboard keep the `lime-deep` ring on white. The profile's "Edit" for payment methods is `lime-deep` text (was plain lime, ~1.3:1; changed 2026-11-05).
- **Status**: `status-unpaid` (amber), `status-marked` (blue), `status-confirmed` (green), always paired with a word and an icon shape.
- **Wallet** colors identify the payer's wallets on cards and in the pay sheet. Whish red matches Whish's own brand color; OMT yellow matches OMT's. Neo and Suyool are placeholders until their brand colors are checked (PRD Q19).

## Typography

One family: the platform system font (SF Pro on iPhone, Roboto on Android, Segoe UI on Windows). It ships optical sizing and is free to load. Fixed rem scale with roughly 1.2 between steps.

- **Amount** (3.5rem, 700, −0.03em): your share. The cents render at 55% size in `night-muted`, like the inspo balance (`$ 17 .40`). Always `tabular-nums`.
- **Title** (1.75rem), **section title** (1.5rem: "Items", "Details" over their lists), **heading** (1.25rem), **body** (1.0625rem, iOS body size), **label** (0.9375rem, 600, buttons and row titles), **caption** (0.8125rem, metadata and chips).
- Large text tracks tighter, small text slightly looser. `text-wrap: balance` on titles. No uppercase except chip labels of one or two words.

## Layout

Mobile first, designed at 390 px wide. One column; on wider screens the app stays a 480 px column centered on `night`.

- **Guest bill:** dark top (venue, who paid, your share or the bill total), then the white sheet: before joining, a compact name field and Join (44 px) above the items; then the items. Once joined, a docked action bar (Done or Pay with your total). No wallet cards on this screen (removed 2026-11-03); wallets appear in the pay sheet.
- **Payer bill:** the same pattern. Dark top (back, Edit and Share pills, venue as a title, the card total as the big amount, "Bill + tips" under it), then the white sheet: People (one row per person: avatar, name, method, what they owe, status chip; tap for a sheet with Mark as paid), Your items (the guest's claim rows), the receipt photos, and the breakdown down to Card total. The top says **Bill total** (receipt plus tips; "Subtotal $X + tips $Y" under it only when someone tipped) and the amount turns `status-confirmed` green once the bill is covered (collected plus the payer's own share reaches it). The breakdown ends on Bill total; with tips it reads Subtotal, Tips, Bill total. Under Your items, a "Your tip" row (Add tip / Change, hidden once submitted) opens the guests' tip sheet. Docked: Submit (lime, no amount; was "Card paid · $X"), which becomes a solid red Undo submit once submitted (team choice, 2026-11-05); the "Card paid" chip in the top shows the state. What nobody has claimed shows as "Unpaid" in red, as on the guest page. **Dashboard (home):** "Still owed to you" in title size, then each bill as a row (venue, date and guests; total and what's owed in amber, or "All paid").
- Spacing on a 4 px base (`xs` 4 to `3xl` 48). Screen gutter 20 px. List rows are 64 px minimum with hairline separators, not cards.
- Safe areas respected with `env(safe-area-inset-*)`. Docked bars sit above the home indicator.

## Elevation & Depth

Depth comes from the night/day contrast, not shadows. The sheet casts one soft upward shadow onto the night area. Bottom sheets (tip, pay) use a dimming scrim and push nothing else; they are modal tasks. **iPhone Safari rules (learned on a real iPhone 17, 2026-11-03):**
- The status bar tint follows `body`'s background, so `body` is `night` (matches the dark tops). Light screens (`.screen`) paint their own `day`.
- The bottom toolbar tint comes from a **solid** element at the bottom edge; translucent ones are skipped. So the docked action bar is solid `day`, with no blur and no separator line (removed at the team's request; the guest page's Done / Pay bar has a light `day-line` hairline on top again, team choice 2026-11-05), and light screens keep a 2px solid white strip fixed at the bottom.
- Tested on the phone (2026-11-05): the area behind Safari's bottom address bar takes its colour only from a **real element stuck to the bottom edge** (a sticky dock, like the light screens'). A page background colour, a fixed layer (even 50vh), thin fixed strips and `theme-color` don't change it. Dark screens have no dock, so it is black there.
- Scrolling past the end bounces and reveals `body`'s black. Light screens put a fixed white layer behind the bottom half of the viewport (`.screen::before`, `z-index: -1`) so the bounce shows white.
- The dock is part of the page (`position: sticky; bottom: 0`, last child of `.screen`), not fixed over it, so sheets need no reserved bottom padding and short screens don't scroll.
- Things you tap are not text-selectable (no long-press Copy/Look Up menu); inputs stay selectable.
- Full-width row highlights are clipped to the sheet's rounded corners (`.surface { overflow: clip }`).

## Shapes

Pills for every button and stepper. 28 px top corners on sheets, 20 px on wallet cards, 8 px on chips. Avatars are circles that overlap by 30% (claimants on an item, like the inspo's app avatars with `+2`).

## Components

- **Pill buttons:** `button-primary` (lime) for the one main action per screen; `button-night` on the dark top; `button-day` on white. 52 px primary height, 44 px secondary. Press feedback on pointer-down: scale 0.97 in 100 ms.
- **Item row:** name and unit price on the left, claim state on the right. Unclaimed: a `Claim` pill. Claimed by you: a stepper (− count +) and the row tinted `lime-soft`. Under the name: "2 of 5 claimed" plus claimant avatars.
- **Stepper:** pill with − and + buttons (44 px hit area each) and the count between. Minus at 1 unclaims.
- **Bottom sheet:** native `<dialog>` for focus and Escape handling; the panel slides up with a critically damped spring (no bounce) and the dim fades in on that same spring; closing, the dim and the panel's shadow fade out in 0.16 s, so the page is clear before the sheet reaches the bottom, can be dragged down to dismiss with velocity handoff, and cross-fades instead when reduced motion is on.
- **Tip → pay:** one sheet, two steps. Done opens it on "Tip"; Add or No tip swaps the content in place (a 0.18 s cross-fade, height easing out to fit, no slide), and the title becomes "Pay Ralph". The pay step shows the amount, Copy amount and the methods; no breakdown line (team choice, 2026-11-05).
- **Screen changes:** instant, no slide (page stacking was tried on 2026-11-05 and removed).
- **Loading:** screens with a known layout show skeletons; the rest show a lime spinner after 0.3 s (`components/Loading.jsx`).
- **Toast:** a pill as wide as its message (24 px radius), `night` at 78% over a 20 px blur of the page, floating above the dock; solid `night` when reduced transparency is on (team choice, 2026-11-05).
- **Status chip:** tinted background, colored dot, one word (Unpaid, Paid?, Confirmed).
- **Amount display:** big whole part, small cents, with a copy button where a guest needs to type it into a wallet app.
- **Error messages:** small (caption) red text, regular weight, centered, no background box (`.form-error`). Set on Log in and applied everywhere (2026-11-03). A failed upload keeps its normal box with a red dashed edge and a red message.

## Do's and Don'ts

**Do**
- Keep your share the largest element on every guest screen.
- Show the math: tap the total to see items, tax, service and tip.
- Use people's names and wallet names in copy ("Open Whish", "Ralph paid").
- Give every state a word, not just a color.

**Don't**
- Don't use lime as text on white, or on inactive controls.
- Don't use cards for list rows, side-stripe borders, gradient text or glass cards.
- Don't add decorative motion. Motion shows a claim, a total changing, a sheet arriving.
- Don't make anything look like a card-payment checkout.
