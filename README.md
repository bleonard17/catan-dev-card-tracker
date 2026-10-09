# Catan Dev Card Tracker

A lightweight browser-based development-card probability tracker for the standard 25-card CATAN deck. Designed for a narrow split-screen panel beside Colonist.io.

## Game actions

- **Dev Bought** — an opponent buys an unknown development card. Decreases deck size and increases hidden cards.
- **I Drew** — you draw a card of that type. Decreases deck size and records its known identity.
- **Played** — someone plays a card of that type, including **a card you previously recorded with I Drew**.
  - If only one owner is possible, the tracker records it in one click.
  - If both you and an opponent could have played it, choose **Mine** or **Opponent**.
  - **Mine:** increments played count only; your draw was already known, so draw odds do not change.
  - **Opponent:** records the identity of a previously hidden opponent draw; draw odds update.
- **Undo** — reverses the last recorded game action.
- **Reset** — starts a fresh game, with confirmation.

The row displays **X of N played · Y known**. Played counts real-world plays. Known counts card identities the tracker has learned (your own draws plus opponents' revealed cards). Rows are marked OUT once every card of that type is known, but you can still play your remaining own cards.

## Math

Standard deck: 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty, 2 Monopoly.

For each card type `i`:

```text
Known[i] = MyDrawn[i] + OpponentPlayed[i]
Hidden = TotalDrawn - sum(Known)
P(next draw is i) = (Original[i] - Known[i]) / (25 - sum(Known))
```

If the deck is empty, next-draw probability is 0 for all types.

Opponent hidden purchases shrink the physical deck but not the per-type *conditional* probability by themselves. Playing your own known card also doesn't change that probability. Opponent reveals do.

## Technical notes

- No accounts, backend or persistence; page refresh resets the session.
- GitHub Pages with static HTML/CSS/JavaScript.
- The main tracker is at https://devcard.trilho.dev/.
- Social preview metadata and share image are in `index.html`, `social-preview.svg` and `og-image.png`.

Unofficial fan-made tool; see the on-site Legal section for attribution and non-affiliation details.
