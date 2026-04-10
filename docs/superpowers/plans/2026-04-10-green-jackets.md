# Green Jacket Trophy Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a green jacket tally banner to the Bet Winners card that shows how many bets each player has won, using 🧥 emojis in a dark green banner.

**Architecture:** Pure counting function in `services/betting.js` tallies winners from the existing leaderboard object. Frontend replicates the same logic inline (no shared module path between `services/` and `public/`). No new API endpoints or Redis keys.

**Tech Stack:** Node.js, Vitest, vanilla JS + Tailwind CSS frontend

---

### Task 1: Add `countGreenJackets()` to `services/betting.js` with tests

**Files:**
- Modify: `services/betting.js` (add export at end of file)
- Modify: `test/betting.test.js` (add new describe block at end)

- [ ] **Step 1: Write the failing tests**

Add to the end of `test/betting.test.js`:

```js
import { countGreenJackets } from '../services/betting.js';

// ── countGreenJackets ───────────────────────────────────────────────────────

describe('countGreenJackets', () => {
  it('returns all zeros when no bets are resolved', () => {
    const lb = {
      day1: { type: 'pending' },
      day2: { type: 'pending' },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('awards one jacket for a sole winner', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Mike' },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 0, Marshall: 0,
    });
  });

  it('awards jackets to both players in a two-way tie', () => {
    const lb = {
      day1: { type: 'two_way_tie', winners: ['Mike', 'Caleb'] },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 1, Marshall: 0,
    });
  });

  it('awards no jackets for a three-way tie', () => {
    const lb = {
      day1: { type: 'three_way_tie', winners: ['Mike', 'Caleb', 'Marshall'] },
      wcDaily: {},
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('counts WC daily winners', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'winner', wcWinners: ['Mike'] },
        day2: { type: 'no_wc_winner' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 0, Marshall: 0,
    });
  });

  it('counts WC daily two-way tie winners', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'two_way_tie', wcWinners: ['Mike', 'Caleb'] },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 1, Caleb: 1, Marshall: 0,
    });
  });

  it('counts WC tournament winner', () => {
    const lb = {
      wcDaily: {},
      wc: { resolved: true, wcWinners: ['Marshall'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 1,
    });
  });

  it('skips WC daily three-way ties', () => {
    const lb = {
      wcDaily: {
        day1: { type: 'three_way_tie' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 0, Marshall: 0,
    });
  });

  it('accumulates across multiple bets correctly', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Mike' },
      day2: { type: 'winner', winner: 'Mike' },
      day3: { type: 'two_way_tie', winners: ['Mike', 'Caleb'] },
      day4: { type: 'winner', winner: 'Caleb' },
      overall: { type: 'winner', winner: 'Marshall' },
      wcDaily: {
        day1: { type: 'winner', wcWinners: ['Marshall'] },
        day2: { type: 'no_wc_winner' },
        day3: { type: 'pending' },
      },
      wc: { resolved: true, wcWinners: ['Marshall'] },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 3, Caleb: 2, Marshall: 3,
    });
  });

  it('handles mixed pending and resolved bets', () => {
    const lb = {
      day1: { type: 'winner', winner: 'Caleb' },
      day2: { type: 'pending' },
      wcDaily: {
        day1: { type: 'pending' },
      },
      wc: { resolved: false },
    };
    expect(countGreenJackets(lb, ['Mike', 'Caleb', 'Marshall'])).toEqual({
      Mike: 0, Caleb: 1, Marshall: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/betting.test.js`
Expected: FAIL — `countGreenJackets` is not exported from `../services/betting.js`

- [ ] **Step 3: Implement `countGreenJackets` in `services/betting.js`**

Add at the end of `services/betting.js`:

```js
export function countGreenJackets(leaderboard, users) {
  const counts = {};
  for (const user of users) counts[user] = 0;

  // Daily bets: day1, day2, day3, day4, overall
  const betKeys = ['day1', 'day2', 'day3', 'day4', 'overall'];
  for (const key of betKeys) {
    const bet = leaderboard[key];
    if (!bet) continue;
    if (bet.type === 'winner') {
      if (counts[bet.winner] !== undefined) counts[bet.winner]++;
    } else if (bet.type === 'two_way_tie') {
      for (const w of bet.winners) {
        if (counts[w] !== undefined) counts[w]++;
      }
    }
  }

  // WC daily bets
  const wcDaily = leaderboard.wcDaily || {};
  for (const key of Object.keys(wcDaily)) {
    const wd = wcDaily[key];
    if (!wd || !wd.wcWinners) continue;
    if (wd.type === 'winner' || wd.type === 'two_way_tie') {
      for (const w of wd.wcWinners) {
        if (counts[w] !== undefined) counts[w]++;
      }
    }
  }

  // WC tournament
  const wc = leaderboard.wc;
  if (wc?.resolved && wc.wcWinners) {
    for (const w of wc.wcWinners) {
      if (counts[w] !== undefined) counts[w]++;
    }
  }

  return counts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/betting.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/betting.js test/betting.test.js
git commit -m "feat: add countGreenJackets function with tests"
```

---

### Task 2: Add green jacket banner to scoreboard frontend

**Files:**
- Modify: `public/app.js` (~line 1148, inside the `if (hasBets || hasWCDaily)` block)

- [ ] **Step 1: Add jacket counting logic and banner rendering**

In `public/app.js`, after the `betResults` computation (after line 1146) and before the line `html += \`<div class="card mb-4"><div class="section-title">Bet Winners</div>\`;` (line 1148), add the green jacket banner:

```js
    // Count green jackets per user
    const jacketCounts = {};
    for (const u of users) jacketCounts[u] = 0;
    const jacketBetKeys = ['day1', 'day2', 'day3', 'day4', 'overall'];
    for (const key of jacketBetKeys) {
      const bet = lb[key];
      if (!bet) continue;
      if (bet.type === 'winner') { if (jacketCounts[bet.winner] !== undefined) jacketCounts[bet.winner]++; }
      else if (bet.type === 'two_way_tie') { for (const w of bet.winners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; } }
    }
    const wcDaily = lb.wcDaily || {};
    for (const key of Object.keys(wcDaily)) {
      const wd = wcDaily[key];
      if (wd?.wcWinners && (wd.type === 'winner' || wd.type === 'two_way_tie')) {
        for (const w of wd.wcWinners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; }
      }
    }
    if (lb.wc?.resolved && lb.wc.wcWinners) {
      for (const w of lb.wc.wcWinners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; }
    }

    const totalJackets = Object.values(jacketCounts).reduce((a, b) => a + b, 0);
```

Then change line 1148 from:

```js
    html += `<div class="card mb-4"><div class="section-title">Bet Winners</div>`;
```

to:

```js
    html += `<div class="card mb-4"><div class="section-title">Bet Winners</div>`;
    if (totalJackets > 0) {
      html += `<div style="display:flex;gap:16px;margin-bottom:16px;padding:12px;background:linear-gradient(135deg,#065f46,#047857);border-radius:8px">`;
      for (const u of users) {
        const count = jacketCounts[u];
        if (count > 0) {
          html += `<div style="text-align:center;flex:1">`;
          html += `<div style="font-size:24px">${'🧥'.repeat(count)}</div>`;
          html += `<div style="color:#a7f3d0;font-size:11px;font-weight:600">${u} — ${count}</div>`;
          html += `</div>`;
        } else {
          html += `<div style="text-align:center;flex:1">`;
          html += `<div style="color:#6b8a7a;font-size:11px;font-weight:600">${u} — 0</div>`;
          html += `</div>`;
        }
      }
      html += `</div>`;
    }
```

- [ ] **Step 2: Verify the app loads without errors**

Run: `node server.js` (briefly, or check syntax)
Expected: Server starts without errors. Navigate to the scoreboard page — the banner appears when bets are resolved, hidden when none are.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add green jacket trophy banner to scoreboard"
```

---

### Task 3: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, including the new `countGreenJackets` tests.

- [ ] **Step 2: Final commit for .gitignore if not already committed**

Check if the `.superpowers/` gitignore addition needs committing:

```bash
git status
git add .gitignore
git commit -m "chore: add .superpowers/ to gitignore"
```

(Skip if already committed.)
