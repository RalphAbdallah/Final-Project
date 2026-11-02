# Product

## Register

product

## Users

**Guests:** friends, students and coworkers in Lebanon, at a restaurant table after a meal. They open a link or scan a QR code on their own phone, often on mobile data, in dim evening light, between conversations. They have no account and won't make one. Their job: find what they had, see exactly what they owe, pay the way they already do (cash, Whish, OMT, Neo, Suyool), and get back to the table.

**Payer (also called the admin):** the one person who pays the restaurant, usually by card, with everyone's tips added. Their job: enter the bill fast, share it while everyone is still seated, know the exact card amount, and see who has paid back without chasing anyone for weeks.

## Product Purpose

splIT splits a shared receipt in under a minute and tracks who has paid the payer back. It records who owes what; money moves outside the app, in cash or wallet apps. Success: every guest settles from their own phone without an account, every split adds up to the receipt to the cent, and the payer knows at a glance who still owes.

## Brand Personality

Quick, fair, sociable. The voice is plain and friendly, uses people's names ("Ralph paid"), and lets numbers do the talking. Never bank-speak, never legal tone. Settling up should feel as light as the dinner, and nobody should ever feel they paid for someone else's plate.

Visual reference (from `inspo/`): a dark wallet home screen with a large balance, pill actions, colorful cards peeking in from the edge and a white sheet of transactions sliding up; and a light list with a colored status timeline and small tinted tags.

## Anti-references

- Banking apps: dense forms, navy and gold, small print, legal tone.
- Expense ledgers (Splitwise-style): running balances, debt graphs, spreadsheet density.
- Payment-gateway checkouts: splIT never takes card details, so it must not look like it does.
- Generic SaaS: hero metrics, identical card grids, purple gradients.

## Design Principles

1. **The table is the context.** One hand, one glance, low light, constant interruptions. Every screen works in that moment.
2. **Numbers are the interface.** The amount you owe is the biggest thing on screen, and every amount adds up.
3. **Fair means showing the math.** Any share can be traced back to items, tax, service and tip.
4. **No account, no friction.** A guest goes from scan to paid in under a minute.
5. **Borrow what people already know.** Wallet-app patterns (a balance, pill actions, a sheet) instead of invented controls.

## Accessibility & Inclusion

WCAG 2.2 AA. Touch targets at least 44 × 44 px. The guest flow works with VoiceOver and TalkBack. Honors reduced motion and reduced transparency. Payment status is never shown by color alone. English UI for the MVP, with USD and LBP formatting.
