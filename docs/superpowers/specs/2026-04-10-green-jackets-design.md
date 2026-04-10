# Green Jacket Trophy Banner — Design Spec

## Overview

Add a green jacket tally to the Bet Winners card on the scoreboard. Each bet won earns a green jacket (🧥). The banner shows at a glance who's collecting the most jackets across the tournament — a fun, Masters-themed layer on top of the existing bet results.

## Rules

- **One jacket per bet won.** Ties included — all tied winners get a jacket.
- **Three-way ties award no jackets** (existing behavior: pot rolls forward, no winner).
- **Eligible bets (max 7 jackets):**
  - Day 1 Best-6
  - Day 2 Best-6
  - Day 3 Best-2
  - Day 4 Best-2
  - Overall Best-2
  - WC Daily (one per day a WC golfer wins sole low)
  - WC Tournament
- **Banner only renders when at least one bet has resolved.** Hidden during setup/drafting/before any day completes.

## Visual Design

- **Location:** Top of the Bet Winners card, above the existing results table.
- **Style:** Dark green gradient banner (`#065f46` to `#047857`), rounded corners.
- **Per player:** Column with repeated 🧥 emojis matching win count, player name + count below in light green text.
- **Zero jackets:** Player still shown, muted style, "0" with no emoji.
- **Layout:** Flexbox row, evenly spaced columns for each player.

## Data Flow

The `/api/leaderboard` endpoint already returns all bet results needed. No new API endpoints or Redis keys required.

### Counting Logic (`services/betting.js`)

New function: `countGreenJackets(leaderboard, users)`

Input: the leaderboard object from `computeLeaderboard()` and the users array.

Returns: `{ Mike: 3, Caleb: 1, Marshall: 2 }` (jacket count per player).

Algorithm:
1. Initialize counts to 0 for all users.
2. For each of the 5 daily bet keys (`day1`, `day2`, `day3`, `day4`, `overall`):
   - If bet type is `winner`: increment count for `bet.winner`.
   - If bet type is `two_way_tie`: increment count for both `bet.winners`.
   - Skip `pending`, `three_way_tie`, and any unresolved states.
3. For WC daily results (`leaderboard.wcDaily`), iterate each day:
   - If type has `wcWinners` array with entries: increment count for the user(s) who picked those WC golfers. (Need to map WC golfer back to the user who picked them.)
4. For WC tournament (`leaderboard.wc`):
   - If resolved with `wcWinners`: same mapping — increment the picking user(s).
5. Return the counts object.

### Frontend (`public/app.js`)

In `renderScoreboard()`, after computing `betResults` and before rendering the table:

1. Compute jacket counts from the leaderboard data (replicate counting logic client-side, or pass from the leaderboard response).
2. Check if total jackets > 0. If not, skip the banner.
3. Render the banner HTML: green gradient div with flex columns per user.
4. Each column: repeated 🧥 emojis (one per jacket), player name, numeric count.
5. Zero-jacket players: show name with "0" in muted color.

**Decision: dual implementation.** The leaderboard response already contains all bet result objects. `countGreenJackets()` in `services/betting.js` is the canonical, tested implementation. The frontend (`public/app.js`) implements the same tally inline since it doesn't import from `services/` (it uses ES module imports from `public/`). The logic is a simple loop over bet results — keeping it in both places is acceptable given the simplicity. Tests cover the `services/` version.

## Testing

- **Unit tests for `countGreenJackets()`** in `test/`:
  - No resolved bets returns all zeros.
  - Sole winner gets 1 jacket.
  - Two-way tie gives both players a jacket.
  - Three-way tie gives no jackets.
  - WC daily winner maps back to correct user.
  - Multiple wins accumulate correctly.
  - Mixed scenario: some resolved, some pending, some tied.

## Files Changed

| File | Change |
|------|--------|
| `services/betting.js` | Add `countGreenJackets()` function |
| `public/app.js` | Add banner rendering in scoreboard, client-side jacket counting |
| `test/betting.test.js` | Unit tests for jacket counting |
| `.gitignore` | Add `.superpowers/` (already done in worktree) |

## Out of Scope

- Custom SVG jacket icon (emoji is fine for now; can upgrade later).
- Jacket animations or confetti.
- Separate jacket leaderboard page.
- Jacket data persisted in Redis.
