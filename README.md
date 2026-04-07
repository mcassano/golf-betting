# Golf Betting App

A real-time golf tournament betting app for a small group of friends. Run a snake draft to pick golfers, place wild card bets, and track daily scores with automatic payout calculations.

## How It Works

1. **Setup** — Admin creates a tournament and enters the player list (golfers).
2. **Draft** — A snake draft (6 rounds) assigns 6 golfers to each user.
3. **Wild Card** — Each user picks one WC-eligible golfer (bottom 50th percentile). If that golfer wins the tournament, the user collects $20 from each opponent.
4. **Scoring** — Admin enters daily scores. The app computes daily and overall standings.
5. **Payouts** — Six bets run simultaneously:
   - **Days 1 & 2**: Lowest combined score across all 6 golfers wins $5 from each loser. If any team has WDs, all teams score their best `6 - maxWDs` golfers that day to keep things fair.
   - **Days 3 & 4**: Lowest score from your best 2 golfers that day wins $5 from each loser.
   - **Overall**: Best 2 golfers by cumulative 4-day total wins $5 from each loser.
   - **Wild Card (tournament)**: If your WC golfer wins the tournament, you collect $20 from each opponent.
   - **Wild Card (daily)**: On any day a wildcard golfer has the sole lowest round across all 21 selected golfers (drafted + WC), the WC owner collects $5 from each opponent. Ties between WC golfers split; any tie with a drafted golfer voids the payout.

## Withdrawals (WD)

Admin can mark a golfer as WD from a given day forward via the score table. WD differs from CUT: CUT golfers take an 80-stroke penalty for remaining days, while WDs trigger the days-1&2 leveling adjustment above.

## Prerequisites

- **Node.js** 18+
- **Redis** (local or remote)

## Quick Start

```bash
# Install dependencies
npm install

# Start Redis (if not already running)
redis-server &

# Run the app
npm start
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `COOKIE_SECRET` | `golf-dev-secret-change-me` | Signed cookie secret (set in production!) |
| `GOLF_USERS` | `Mike,Caleb,Marshall` | Comma-separated list of player names |

## Development

```bash
npm run dev   # starts with --watch for auto-reload
```

## Deployment

Configured for [Railway](https://railway.app) via `railway.toml`. Ensure `REDIS_URL` and `COOKIE_SECRET` are set in your environment.

## Tech Stack

- **Backend**: Express, Socket.io, ioredis
- **Frontend**: Vanilla JS, Tailwind CSS (CDN)
- **Data**: Redis (all state stored as JSON keys)
