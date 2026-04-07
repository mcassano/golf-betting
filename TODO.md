# TODO — Big Ideas

## Season-Long Standings
Track cumulative winnings across tournaments and display a season leaderboard. Show each player's total earnings, win count, and per-tournament breakdown.

## Tournament History Archive
Persist completed tournaments (currently only one lives in Redis at a time). Let users browse past results, scores, and payouts. Likely requires a Postgres migration or Redis snapshots keyed by tournament ID.

## Draft Recap
After the draft completes, generate a summary showing each team's projected strength based on world rankings or pre-tournament odds. Gives everyone something to argue about before play starts.

## Side Props
Admin-defined prop bets beyond the core 5. Examples: "Will any golfer shoot under 65?", "Hole-in-one on Sunday?", "Will [golfer] make the cut?" Each prop has a buy-in and payout structure.

## Venmo Integration
After a tournament completes, auto-generate Venmo/PayPal payment request links based on the final payout ledger. One-tap settling.

## Mobile-First Redesign
Rebuild the UI with a mobile-first responsive layout. Most usage happens on phones during rounds — optimize for that context (large tap targets, collapsible sections, swipe between views).

## Post-Tournament Analytics
Charts and visualizations after a tournament wraps: score progression by day, best/worst individual picks, "what-if" scenarios (e.g., what if you'd drafted X instead of Y).

## Draft Grade Report
After the tournament, grade each team's draft based on actual results. Compare draft position value vs. outcome. Show steals, busts, and overall draft efficiency.

## ~~PIN Code Auth~~ ✅
~~Require a short PIN to log in instead of just selecting a name. Prevents someone from impersonating another player or messing with their picks.~~
