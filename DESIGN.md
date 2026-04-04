# Design Document

## Overview

Golf Betting is a single-page app that manages a golf tournament betting pool among friends. It handles drafting golfers, entering scores, computing daily/overall bets, and tracking a wild card side bet.

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐      ┌───────┐
│  Browser SPA │ ◄──────────────►  │  Express +    │ ◄──► │ Redis │
│  (Vanilla JS)│   HTTP REST       │  Socket.io    │      └───────┘
└─────────────┘                    └──────────────┘
```

- **Single server process** — Express serves the SPA, REST API, and Socket.io on one port.
- **Redis** — All state is stored as JSON-serialized strings in Redis. No SQL database needed.
- **No build step** — The frontend is vanilla JS with Tailwind via CDN. No bundler or transpiler.

## Data Model (Redis Keys)

| Key | Type | Description |
|---|---|---|
| `users` | JSON array | List of user names (e.g. `["Mike","Caleb","Marshall"]`) |
| `tournament:meta` | JSON object | `{ name, status }` — status is one of: `setup`, `drafting`, `wc_selection`, `day1`-`day4`, `complete` |
| `tournament:players` | JSON array | All golfers: `[{ name, wcEligible }]` |
| `draft:order` | JSON array | Randomized user order for the snake draft |
| `draft:picks` | JSON array | `[{ player, golfer, pickNumber }]` |
| `draft:currentPick` | string | Current pick index (0-based) |
| `teams:<user>` | JSON array | List of golfer names drafted by that user |
| `wc:<user>` | string | Wild card golfer name |
| `scores:<golfer>:day<N>` | string | Score value: integer, `"CUT"`, or `"WD"` |

## Tournament Lifecycle

```
setup → drafting → wc_selection → day1 → day2 → day3 → day4 → complete
```

Each transition is triggered by admin action (except `drafting` → `wc_selection`, which happens automatically when the last draft pick is made, and `wc_selection` → `day1`, which happens when all users have picked their WC).

## Scoring Rules

- **Days 1 & 2**: Sum of all 6 drafted golfers' scores for that day.
- **Days 3 & 4**: Sum of the best 2 (lowest-scoring) golfers for that day.
- **Overall**: Sum of the best 2 golfers by cumulative 4-day total.
- **CUT/WD**: A golfer who is cut or withdraws receives a penalty score of 80 for each remaining day.

## Betting & Payouts

Five independent $5 bets (days 1-4 + overall):
- **Outright winner**: Collects $5 from each loser.
- **Two-way tie**: Each tied player collects $5 from the third player.
- **Three-way tie**: No payout.

Wild card bet ($20):
- Each user picks one WC-eligible golfer (not on their own team).
- If that golfer wins the tournament outright, the user collects $20 from each opponent.

## Real-Time Updates

Socket.io broadcasts events for key state changes:
- `draft:started`, `draft:pick`, `draft:complete` — drive the draft UI in real time.
- `wc:picked` — notify when others pick their WC.
- `tournament:advanced` — status transitions trigger view refreshes.
- `scores:updated` — leaderboard and scoreboard auto-refresh.

## Authentication

Lightweight signed-cookie auth. Users pick their name from a list at login — no passwords. The cookie is `httpOnly`, signed with `COOKIE_SECRET`, and lasts 7 days. This is appropriate for a trusted friend group, not a public-facing app.

## Frontend Views

| View | Route | Description |
|---|---|---|
| Login | `login` | Pick your name |
| Admin | `admin` | Tournament setup, score entry, status advancement |
| Draft | `draft` | Live snake draft with pick tracking |
| My Team | `myTeam` | Your 6 golfers + WC selection |
| Leaderboard | `leaderboard` | Bet standings and payout summary |
| Scoreboard | `scoreboard` | All golfer scores grouped by team |
