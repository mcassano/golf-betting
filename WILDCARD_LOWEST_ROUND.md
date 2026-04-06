# Wildcard Lowest Round Bet — Design Exploration

## Concept

Separate daily side bet on wildcard golfers. Evaluated per round (days 1-4 only, no overall/cumulative component).

## Rules

- **Scope:** Compare individual round scores across all 21 selected golfers (18 drafted + 3 WC)
- **Win condition:** A WC golfer must have the **sole lowest round** of the day among all 21 golfers. Only acceptable tie is with other WC golfers — any tie with a drafted golfer negates the payout (even if it's the WC owner's own drafted pick).
- **Payout:** $5 per loser per day. Same structure as existing daily bets.
- **Multiple WC winners:** If two WC golfers tie for lowest (no drafted golfer matches), both owners collect $5 from the third player. If all three WC golfers tie for lowest: no payout (three-way wash).
- **Frequency:** Days 1-4 only (4 chances per tournament). No overall/cumulative component — that's covered by the existing WC tournament bet.
- **Additive:** Lives alongside the existing "WC wins tournament = $20/loser" bet. Not a replacement.
- **Max WC exposure per tournament:** up to $5×2×4 (daily) + $20×2 (tournament) = $80 max

## Testing

No tests. Do not test. This is vibes.

## Implementation Plan

### Scoring: `services/scoring.js`

New function needed:
```js
// Get the lowest individual round score among all selected golfers for a given day
async function lowestRoundForDay(users, dayN) {
  // Gather all drafted golfers + all WC golfers
  // Score each for the given day
  // Return { golfer, score, owner, isWC }
}
```

### Betting: `services/betting.js`

New function:
```js
async function computeWCDailyResult(users, dayN) {
  // 1. Get all golfer scores for dayN (drafted + WC)
  // 2. Find the minimum score
  // 3. Check if any WC golfer has that minimum
  // 4. If yes, determine payout: WC owner collects from other 2
  // 5. Handle ties (multiple WCs at minimum, or WC ties with non-WC)
}
```

### Leaderboard: `services/betting.js` → `computeLeaderboard()`

Add `wcDaily` results alongside existing day results:
```js
result.wcDaily = {
  day1: { ... }, // computed if status >= day1
  day2: { ... }, // computed if status >= day2
  // etc.
};
```

### Data Model

No new Redis keys needed — we already have:
- `wc:<user>` — each user's WC pick
- `scores:<golfer>:day<N>` — individual golfer day scores
- `teams:<user>` — each user's drafted team

### Frontend

- Add a "WC Daily" row/section to the leaderboard
- Show which WC golfer (if any) had the lowest round each day
- Highlight the payout

### API

- `GET /leaderboard` already returns the full leaderboard object — just add the new field
- No new endpoints needed

## Estimated Complexity

- **scoring.js**: ~20 lines (new helper)
- **betting.js**: ~40 lines (new compute function + leaderboard integration)
- **Frontend**: Update leaderboard rendering to show WC daily results
- **No schema changes**, no new Redis keys, no new endpoints

## Example Scenario

| Player   | WC Pick         | Day 1 Score |
|----------|----------------|-------------|
| Mike     | Tiger Woods     | 68          |
| Caleb    | Phil Mickelson  | 71          |
| Marshall | Bubba Watson    | 72          |

Lowest drafted golfer score on Day 1: 67 (Scottie Scheffler, on Mike's team)

Tiger's 68 is NOT the lowest overall → no WC daily payout.

But if Tiger shot 66 → lowest of all 21 golfers → Mike collects $5 from Caleb and $5 from Marshall.
