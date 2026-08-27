# Golf Betting App

A real-time golf tournament betting app for a small group of friends. Run a snake draft to pick golfers, place wild card bets, and track daily scores with automatic payout calculations.

## How It Works

1. **Setup** — Admin creates a tournament and enters the player list (golfers).
2. **Draft** — A snake draft (6 rounds) assigns 6 golfers to each user.
3. **Wild Card** — Each user picks one WC-eligible golfer (bottom 50th percentile). If that golfer wins the tournament, the user collects $20 from each opponent.
4. **Scoring** — Admin enters daily scores. The app computes daily and overall standings.
5. **Payouts** — Six bets run simultaneously. A daily bet's winner is only declared once the admin advances the tournament past that day (Day 1 resolves when status moves to Day 2, … Day 4 and Overall resolve when the tournament is marked Complete). Until then live scores show but no winner is stamped, so a day never resolves just because some teams finished their round early.
   - **Days 1 & 2**: Lowest combined score across all 6 golfers wins $5 from each loser. If any team has WDs, all teams score their best `6 - maxWDs` golfers that day to keep things fair.
   - **Days 3 & 4**: Lowest score from your best 2 golfers that day wins $5 from each loser.
   - **Overall**: Best 2 golfers by cumulative 4-day total wins $5 from each loser.
   - **Wild Card (tournament)**: If your WC golfer wins the tournament, you collect $20 from each opponent.
   - **Wild Card (daily)**: On any day a wildcard golfer has the sole lowest round across all 21 selected golfers (drafted + WC), the WC owner collects $5 from each opponent. Ties between WC golfers split; any tie with a drafted golfer voids the payout.
   - **Missed Cut**: Each player picks one golfer they think will miss the cut. If your golfer misses the cut, you collect $5 from each loser. If multiple golfers miss, each winner collects from the remaining losers. If all miss or none miss, no payout. Picks are set via admin; the bet resolves automatically after the cut is made. The admin enters the **cut line** (to par) when advancing to Day 3 — a golfer missed the cut if they have an explicit CUT or their R1+R2 is worse than the line. The cut line defaults to +4 if not set.

### No-cut events

For events without a cut (e.g. the TOUR Championship), the admin can check **"No cut this week"** during tournament setup (`POST /api/admin/tournament/nocut`). This disables the missed-cut side bet, skips the missed-cut pick phase (Wild Card picks advance straight to Day 1), removes the cut-line requirement when advancing to Day 3, and stops the ESPN sync from ever stamping CUT on a golfer.

## Withdrawals (WD)

Admin can mark a golfer as WD from a given day forward via the score table. WD differs from CUT: CUT golfers take a 99-stroke penalty for remaining days, while WDs trigger the days-1&2 leveling adjustment above.

## ESPN Score Sync

The admin panel can pull live scores from ESPN's public PGA scoreboard instead of entering them by hand.

- **Setup**: pick the ESPN event during tournament setup; players are pulled from the ESPN field by `espnId`.
- **Sync Now**: one-shot fetch that updates any completed round (18 holes) for every player. Manual edits made in the score table take precedence — the sync will not clobber admin overrides.
- **Start Polling / Stop Polling**: background loop that calls Sync Now every 30 minutes. Polling auto-stops once every player has a score recorded for the current day (`meta.status`); admin manually restarts it the next morning.
- Polling state and last-poll time are visible in the admin panel during day1–day4.

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

## Patron Mode

A read-only "Patron" login is available in the driver dropdown. Patron uses its own PIN (default `8912`) and can view the Scoreboard and Bets pages — no admin, draft, or team access.

## Reader API

External consumers can fetch the leaderboard via:

```
GET /api/reader/leaderboard?pin=1829
```

Returns tournament name, status, and full leaderboard data as JSON.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `COOKIE_SECRET` | `golf-dev-secret-change-me` | Signed cookie secret (set in production!) |
| `GOLF_USERS` | `Mike,Caleb,Marshall` | Comma-separated list of player names |
| `PATRON_PIN` | `8912` | PIN for Patron (view-only) login |
| `READER_PIN` | `1829` | PIN for the reader API |

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
