// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  tournament: null,
  view: 'login',
};

let socket = null;

// ── Utilities ─────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function el(id) { return document.getElementById(id); }

// Sum numeric round scores, ignoring CUT/WD/empty. Returns total + count of rounds played.
function sumPlayed(rounds) {
  let total = 0, played = 0;
  for (const v of rounds) {
    if (v === undefined || v === null || v === '' || v === 'CUT' || v === 'WD') continue;
    const n = parseInt(v, 10);
    if (!isNaN(n)) { total += n; played++; }
  }
  return { total, played };
}

// Format raw total relative to par across `played` rounds: e.g. "−4", "E", "+5"
// Under-par values are wrapped in a red span (golf convention).
function toParStr(total, played, par) {
  const diff = total - played * par;
  if (diff === 0) return 'E';
  if (diff > 0) return `+${diff}`;
  return `<span class="text-red-600">${diff}</span>`;
}

// Render a raw round score (e.g. "68"), coloring red if under par.
function dayCell(v, par) {
  if (v === undefined || v === null || v === '') return '<span class="text-gray-300">—</span>';
  if (v === 'CUT') return '<span class="badge badge-cut">CUT</span>';
  if (v === 'WD') return '<span class="badge badge-wd">WD</span>';
  const n = parseInt(v, 10);
  if (!isNaN(n) && n < par) return `<span class="text-red-600">${v}</span>`;
  return `${v}`;
}

function showToast(msg, type = 'info') {
  const colors = { info: 'bg-blue-500', success: 'bg-green-600', error: 'bg-red-500', warning: 'bg-yellow-500' };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 z-50 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${colors[type] || colors.info}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function routeFromStatus(status) {
  if (!status || status === 'setup') return 'admin';
  if (status === 'drafting') return 'draft';
  if (status === 'wc_selection') return 'myTeam';
  return 'leaderboard';
}

function navigate(view) {
  state.view = view;
  renderApp();
}
window.navigate = navigate;

// ── Nav ───────────────────────────────────────────────────────────────────────

function renderNav() {
  const nav = el('nav');
  if (!state.user) { nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');

  el('nav-user').textContent = state.user;
  el('nav-tournament-name').textContent = state.tournament?.name || 'Golf Betting';

  const status = state.tournament?.status;
  const links = [
    { view: 'admin', label: 'Admin', always: true },
    { view: 'draft', label: 'Draft', show: ['drafting', 'wc_selection', 'day1', 'day2', 'day3', 'day4', 'complete'] },
    { view: 'myTeam', label: 'My Team', show: ['wc_selection', 'day1', 'day2', 'day3', 'day4', 'complete'] },
    { view: 'leaderboard', label: 'Leaderboard', show: ['day1', 'day2', 'day3', 'day4', 'complete'] },
    { view: 'scoreboard', label: 'Scoreboard', show: ['day1', 'day2', 'day3', 'day4', 'complete'] },
  ];

  el('nav-links').innerHTML = links
    .filter((l) => l.always || (l.show && l.show.includes(status)))
    .map((l) => `<button onclick="navigate('${l.view}')" class="nav-link ${state.view === l.view ? 'active' : ''}">${l.label}</button>`)
    .join('');
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderApp() {
  renderNav();
  const app = el('app');
  const views = { login: renderLogin, admin: renderAdmin, draft: renderDraft, myTeam: renderMyTeam, leaderboard: renderLeaderboard, scoreboard: renderScoreboard };
  const renderer = views[state.view] || renderLogin;
  renderer(app);
}

// ── View: Login ───────────────────────────────────────────────────────────────

function renderLogin(container) {
  container.innerHTML = `
    <div class="min-h-screen bg-gray-100 flex flex-col items-center justify-start pt-10 px-4"
         style="font-family: Segoe UI, Tahoma, Geneva, Verdana, sans-serif;">
      <div class="bg-white border border-gray-300 rounded shadow-sm w-full max-w-lg">
        <div class="bg-gradient-to-r from-gray-700 to-gray-600 text-white px-5 py-3 rounded-t flex items-center gap-3">
          <span class="text-2xl">🖨️</span>
          <div>
            <h1 class="text-sm font-bold tracking-wide">HP LaserJet Pro M404n</h1>
            <p class="text-xs text-gray-300">Configuration Utility v3.8.1</p>
          </div>
        </div>
        <div class="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div class="flex gap-6 text-xs text-gray-500">
            <span>Status: <span class="text-green-600 font-semibold">Ready</span></span>
            <span>Toner: 68%</span>
            <span>Pages Printed: 12,407</span>
          </div>
        </div>
        <div class="px-5 py-5">
          <div id="printer-form">
            <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Print Driver</label>
            <select id="driver-select"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400">
              <option value="">Loading drivers…</option>
            </select>
            <button onclick="printerApply()"
              class="mt-4 w-full bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium py-2 rounded transition-colors">
              Apply Configuration
            </button>
          </div>
        </div>
        <div class="px-5 py-3 bg-gray-50 border-t border-gray-200 rounded-b">
          <p class="text-[10px] text-gray-400 text-center">Copyright 2009 Hewlett-Packard Development Company, L.P.</p>
        </div>
      </div>
    </div>`;

  api('GET', '/users').then((users) => {
    if (!users || users.length === 0) {
      el('driver-select').innerHTML = '<option value="">No drivers found</option>';
      return;
    }
    el('driver-select').innerHTML =
      '<option value="">— Select Driver —</option>' +
      users.map((u) => `<option value="${u}">${u}</option>`).join('');
  }).catch(() => {
    el('driver-select').innerHTML = '<option value="">Error loading drivers</option>';
  });
}

window.printerApply = function() {
  const name = el('driver-select')?.value;
  if (!name) return;
  showPinInput(name);
};

window.showPinInput = function(name) {
  el('printer-form').innerHTML = `
    <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
      Administrator Authentication
    </label>
    <p class="text-xs text-gray-400 mb-3">Enter admin password to apply driver changes for "${name}"</p>
    <input type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}"
      id="pin-input" placeholder="10-char alphanumeric password"
      class="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-400 tracking-widest" />
    <button onclick="login('${name}')"
      class="mt-3 w-full bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium py-2 rounded transition-colors">
      Authenticate &amp; Apply
    </button>
    <button onclick="renderApp()"
      class="mt-2 w-full text-xs text-gray-400 hover:text-gray-600 text-center">
      Cancel
    </button>
    <div id="pin-error" class="text-red-600 text-xs text-center mt-2 hidden"></div>`;
  setTimeout(() => el('pin-input').focus(), 50);
  el('pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login(name);
  });
};

window.login = async function(name) {
  const pinInput = el('pin-input');
  const pin = pinInput?.value || '';
  if (!/^\d{4}$/.test(pin)) {
    const err = el('pin-error');
    err.textContent = 'Enter a 10-char alphanumeric password';
    err.classList.remove('hidden');
    return;
  }
  try {
    await api('POST', '/session', { name, pin });
    state.user = name;
    state.tournament = await api('GET', '/tournament');
    document.title = state.tournament?.name || 'Golf Betting';
    setupSocket();
    navigate(routeFromStatus(state.tournament?.status));
  } catch (e) {
    const err = el('pin-error');
    err.textContent = e.message || 'Invalid PIN';
    err.classList.remove('hidden');
    pinInput.value = '';
    pinInput.focus();
  }
};

window.logout = async function() {
  await api('POST', '/session/logout');
  state.user = null;
  state.tournament = null;
  document.title = 'HP LaserJet Pro M404n';
  if (socket) { socket.disconnect(); socket = null; }
  navigate('login');
};

// ── View: Admin ───────────────────────────────────────────────────────────────

async function renderAdmin(container) {
  const tournament = await api('GET', '/tournament');
  state.tournament = tournament;
  const status = tournament?.status || null;

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Admin Panel</h2>`;

  // ── Tournament setup (only in setup or no tournament)
  if (!status || status === 'setup') {
    const players = await api('GET', '/players');
    html += `
    <div class="card mb-4">
      <div class="section-title">Tournament Setup</div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
        <div class="flex gap-2">
          <input type="text" id="t-name" value="${tournament?.name || ''}" placeholder="e.g. The Masters 2025" class="flex-1" />
          <button onclick="saveTournamentName()" class="btn btn-primary whitespace-nowrap">Save Name</button>
        </div>
      </div>
      ${status === 'setup' ? `
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Player List <span class="text-gray-400 text-xs">(one name per line)</span>
        </label>
        <textarea id="player-list" rows="12" placeholder="Scottie Scheffler&#10;Rory McIlroy&#10;Jon Rahm&#10;...">${players.map((p) => p.name).join('\n')}</textarea>
        <button onclick="savePlayers()" class="btn btn-primary mt-2">Save Players</button>
      </div>
      <div id="wc-section" class="${players.length ? '' : 'hidden'}">
        <div class="section-title">WC Eligible Golfers <span class="text-gray-400 font-normal text-sm">(bottom 50th percentile)</span></div>
        <p class="text-sm text-gray-500 mb-3">Check golfers that are eligible for Wild Card selection (lower-ranked players).</p>
        <div id="wc-list" class="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-60 overflow-y-auto pr-1">
          ${players.map((p) => `
            <label class="flex items-center gap-2 text-sm p-2 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" ${p.wcEligible ? 'checked' : ''} onchange="toggleWC('${p.name.replace(/'/g, "\\'")}', this.checked)" />
              <span>${p.name}</span>
            </label>`).join('')}
        </div>
      </div>
      <div class="mt-4 pt-4 border-t border-gray-100">
        <button onclick="startDraft()" class="btn btn-primary" ${players.length >= 18 ? '' : 'disabled'}>
          🎲 Start Draft
        </button>
        ${players.length < 18 ? '<p class="text-xs text-gray-400 mt-1">Need at least 18 players to start draft.</p>' : ''}
      </div>` : ''}
    </div>`;
  }

  // ── Score Entry (when tournament is in progress)
  if (status && !['setup', 'drafting', 'wc_selection'].includes(status)) {
    const [players, scores, teams, wcData] = await Promise.all([api('GET', '/players'), api('GET', '/scores'), api('GET', '/teams'), api('GET', '/wc')]);
    const draftedNames = new Set([...Object.values(teams).flat(), ...Object.values(wcData).filter(Boolean)]);
    const draftedPlayers = players.filter((p) => draftedNames.has(p.name));
    const currentDay = { day1: 1, day2: 2, day3: 3, day4: 4, complete: 4 }[status] || 1;
    const rows = draftedPlayers.map((p) => {
      const s = scores[p.name] || {};
      const cells = [1, 2, 3, 4].map((d) => {
        const val = s[`day${d}`] || '';
        const isActive = d === currentDay;
        return `<td class="p-1">
          <input
            type="text"
            data-golfer="${p.name.replace(/"/g, '&quot;')}"
            data-day="${d}"
            value="${val}"
            placeholder="${isActive ? '—' : ''}"
            onblur="saveScoreCell(this)"
            onkeydown="scoreGridKeydown(event, this)"
            class="score-cell w-16 text-center border rounded px-1 py-0.5 text-sm font-mono ${isActive ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'} ${val === 'CUT' || val === 'WD' ? 'text-red-500' : ''}"
          />
        </td>`;
      }).join('');
      const alreadyWD = s[`day${currentDay}`] === 'WD';
      return `<tr class="border-b border-gray-50">
        <td class="py-1 pr-3 text-sm font-medium text-gray-700 whitespace-nowrap">
          ${p.name}
          ${alreadyWD ? '' : `<button onclick="markAsWD('${p.name.replace(/'/g, "\\'")}', ${currentDay})" class="ml-2 text-xs text-red-400 hover:text-red-600 hover:underline font-normal">WD</button>`}
        </td>
        ${cells}
      </tr>`;
    }).join('');
    html += `
    <div class="card mb-4">
      <div class="section-title">Score Entry <span class="text-xs font-normal text-gray-400 ml-2">Tab through cells · raw score (e.g. 68), CUT, or WD · saves on leave</span></div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="text-left text-xs text-gray-500 border-b border-gray-200">
              <th class="py-1 pr-3 font-medium">Golfer</th>
              ${[['Thu',1],['Fri',2],['Sat',3],['Sun',4]].map(([label,d]) => `<th class="py-1 px-1 font-medium text-center ${d === currentDay ? 'text-green-700' : ''}">${label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── ESPN Polling (when tournament is in an active day)
  if (status && ['day1', 'day2', 'day3', 'day4'].includes(status)) {
    const espn = await api('GET', '/admin/espn/status').catch(() => null);
    const polling = !!espn?.polling;
    const last = espn?.lastPollTime ? new Date(espn.lastPollTime).toLocaleString() : 'never';
    html += `
    <div class="card mb-4">
      <div class="section-title">ESPN Polling</div>
      <div class="text-sm text-gray-600 mb-2">
        Status: <span class="${polling ? 'text-green-700' : 'text-gray-500'} font-medium">${polling ? 'on' : 'off'}</span>
        · last poll: <span class="font-mono text-xs">${last}</span>
      </div>
      <div class="flex gap-2">
        ${polling
          ? `<button onclick="stopEspnPolling()" class="btn btn-secondary btn-sm">Stop Polling</button>`
          : `<button onclick="startEspnPolling()" class="btn btn-primary btn-sm">Start Polling</button>`}
        <button onclick="syncEspnNow()" class="btn btn-secondary btn-sm">Sync Now</button>
      </div>
    </div>`;
  }

  // ── Tournament par (always editable when a tournament exists)
  if (status) {
    html += `
    <div class="card mb-4">
      <div class="section-title">Course Par</div>
      <div class="flex gap-2 items-center">
        <input type="number" id="t-par" value="${tournament?.par ?? 72}" min="1" class="w-24" />
        <button onclick="saveTournamentPar()" class="btn btn-secondary btn-sm">Save Par</button>
        <span class="text-xs text-gray-400">Used to derive "to par" displays from raw scores.</span>
      </div>
    </div>`;
  }

  // ── Advance tournament status
  const nextStatus = { setup: null, drafting: null, wc_selection: null, day1: 'day2', day2: 'day3', day3: 'day4', day4: 'complete', complete: null };
  const nextLabels = { day2: 'Advance to Day 2', day3: 'Advance to Day 3', day4: 'Advance to Day 4', complete: 'Mark Tournament Complete' };
  if (status && nextStatus[status]) {
    html += `
    <div class="card mb-4">
      <div class="section-title">Tournament Status: <span class="text-green-700">${status}</span></div>
      <button onclick="advanceTournament('${nextStatus[status]}')" class="btn btn-secondary">
        ${nextLabels[nextStatus[status]]}
      </button>
    </div>`;
  }

  // ── Reset
  html += `
  <div class="card border border-red-100">
    <div class="section-title text-red-700">Danger Zone</div>
    <button onclick="resetTournament()" class="btn btn-danger btn-sm">Reset Tournament</button>
    <p class="text-xs text-gray-400 mt-1">Clears all tournament data (keeps user list).</p>
  </div>`;

  container.innerHTML = html;
}

window.startEspnPolling = async function() {
  await api('POST', '/admin/espn/start-polling');
  showToast('ESPN polling started', 'success');
  navigate('admin');
};

window.stopEspnPolling = async function() {
  await api('POST', '/admin/espn/stop-polling');
  showToast('ESPN polling stopped', 'success');
  navigate('admin');
};

window.syncEspnNow = async function() {
  const r = await api('POST', '/admin/espn/sync-scores', {});
  showToast(`Synced ${r?.updated ?? 0} scores`, 'success');
  navigate('admin');
};

window.saveTournamentPar = async function() {
  const par = parseInt(el('t-par').value, 10);
  if (!par || par <= 0) return;
  await api('POST', '/admin/tournament/par', { par });
  state.tournament = await api('GET', '/tournament');
  showToast(`Course par set to ${par}`, 'success');
  navigate('admin');
};

window.saveTournamentName = async function() {
  const name = el('t-name').value.trim();
  if (!name) return;
  await api('POST', '/admin/tournament', { name });
  state.tournament = await api('GET', '/tournament');
  showToast('Tournament name saved', 'success');
  navigate('admin');
};

window.savePlayers = async function() {
  const raw = el('player-list').value;
  const names = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return;
  const cutoff = Math.floor(names.length / 2);
  const players = names.map((name, i) => ({ name, wcEligible: i >= cutoff }));
  await api('POST', '/admin/players', { players });
  showToast(`Saved ${players.length} players`, 'success');
  navigate('admin');
};

window.toggleWC = async function(name, wcEligible) {
  await api('PATCH', `/admin/players/${encodeURIComponent(name)}/wc`, { wcEligible });
};

window.startDraft = async function() {
  if (!confirm('Start the draft? This will randomize draft order.')) return;
  await api('POST', '/admin/draft/start');
  state.tournament = await api('GET', '/tournament');
  navigate('draft');
};

window.saveScoreCell = async function(input) {
  const golfer = input.dataset.golfer;
  const day = parseInt(input.dataset.day, 10);
  const raw = input.value.trim().toUpperCase();
  if (!raw) return;
  const score = raw;
  try {
    await api('POST', '/admin/scores', { golfer, day, score });
    input.value = score;
    input.classList.toggle('text-red-500', score === 'CUT' || score === 'WD');
    input.classList.remove('border-red-400', 'bg-red-50');
  } catch (e) {
    input.classList.add('border-red-400', 'bg-red-50');
    showToast(`Error saving ${golfer} day ${day}: ${e.message}`, 'error');
  }
};

window.markAsWD = async function(golfer, fromDay) {
  if (!confirm(`Mark ${golfer} as WD from Day ${fromDay} onward?`)) return;
  try {
    await api('POST', '/admin/scores/wd', { golfer, fromDay });
    showToast(`${golfer} marked as WD`, 'success');
    navigate('admin');
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
};

window.scoreGridKeydown = function(e, input) {
  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    const allInputs = Array.from(document.querySelectorAll('.score-cell'));
    const idx = allInputs.indexOf(input);
    const cols = 4;
    const dir = e.shiftKey ? -cols : cols;
    const next = allInputs[idx + dir];
    if (next) next.focus();
    else input.blur();
  }
};

window.advanceTournament = async function(status) {
  if (!confirm(`Advance tournament to ${status}?`)) return;
  await api('POST', '/admin/tournament/advance', { status });
  state.tournament = await api('GET', '/tournament');
  showToast(`Status: ${status}`, 'success');
  navigate('admin');
};

window.resetTournament = async function() {
  if (!confirm('Reset all tournament data? This cannot be undone.')) return;
  await api('POST', '/admin/tournament/reset');
  state.tournament = null;
  showToast('Tournament reset', 'info');
  navigate('admin');
};

// ── View: Draft ───────────────────────────────────────────────────────────────

async function renderDraft(container) {
  const draftState = await api('GET', '/draft/state');
  const tournament = await api('GET', '/tournament');
  const { order, picks, currentPick, currentPlayer, availableGolfers } = draftState;
  const isMyTurn = currentPlayer === state.user;
  const isDraftDone = tournament?.status !== 'drafting';

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Snake Draft</h2>`;

  if (isDraftDone) {
    html += `<div class="alert alert-success">Draft is complete! <button onclick="navigate('myTeam')" class="underline ml-1">View your team →</button></div>`;
  } else if (isMyTurn) {
    const totalPicks = order.length * 6;
    html += `<div class="your-turn-banner mb-4">🏌️ It's your turn to pick! (Pick ${currentPick + 1} of ${totalPicks})</div>`;
  } else {
    const totalPicks = order.length * 6;
    html += `<div class="alert alert-info mb-4">Waiting for <strong>${currentPlayer}</strong> to pick… (Pick ${currentPick + 1} of ${totalPicks})</div>`;
  }

  // Draft order display
  if (order) {
    const pickOrder = buildPickOrderClient(order);
    const rounds = [];
    for (let r = 0; r < 6; r++) {
      rounds.push(pickOrder.slice(r * 3, r * 3 + 3).map((p, i) => {
        const globalIdx = r * 3 + i;
        const isDone = globalIdx < picks.length;
        const isCurrent = globalIdx === currentPick && !isDraftDone;
        return `<span class="px-2 py-0.5 rounded text-xs ${isDone ? 'bg-gray-100 text-gray-400 line-through' : isCurrent ? 'bg-green-100 text-green-800 font-bold ring-1 ring-green-400' : 'bg-white text-gray-600'}">${p}</span>`;
      }).join(''));
    }
    html += `
    <div class="card mb-4">
      <div class="section-title">Draft Order</div>
      <div class="grid grid-cols-6 gap-1 text-center">
        ${rounds.map((r, i) => `<div class="flex flex-col gap-0.5"><div class="text-xs text-gray-400 mb-1">R${i+1}</div>${r}</div>`).join('')}
      </div>
    </div>`;
  }

  html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;

  // Available golfers
  if (!isDraftDone) {
    html += `
    <div class="card">
      <div class="section-title">Available Golfers (${availableGolfers.length})</div>
      <input type="text" id="golfer-search" placeholder="Search…" oninput="filterGolfers()" class="mb-3" />
      <div id="golfer-list" class="max-h-80 overflow-y-auto">
        ${availableGolfers.map((g) => `
          <div class="golfer-item ${!isMyTurn ? 'disabled' : ''}" onclick="${isMyTurn ? `pickGolfer('${g.name.replace(/'/g, "\\'")}')` : ''}">
            <span>${g.name}</span>
            ${g.wcEligible ? '<span class="badge badge-wc">WC</span>' : ''}
          </div>`).join('')}
      </div>
    </div>`;
  }

  // Picks so far
  html += `
  <div class="card">
    <div class="section-title">Picks So Far (${picks.length}/${order ? order.length * 6 : '?'})</div>
    <div class="max-h-96 overflow-y-auto">
      ${picks.length === 0 ? '<p class="text-gray-400 text-sm">No picks yet.</p>' : ''}
      ${picks.map((p, i) => `
        <div class="flex items-center gap-2 py-1.5 px-2 rounded ${p.player === state.user ? 'bg-green-50' : ''} border-b border-gray-50">
          <span class="text-xs text-gray-400 w-5">${i + 1}.</span>
          <span class="text-xs font-medium text-gray-500 w-16 shrink-0">${p.player}</span>
          <span class="text-sm">${p.golfer}</span>
        </div>`).join('')}
    </div>
  </div>`;

  html += `</div>`;
  container.innerHTML = html;
}

function buildPickOrderClient(draftOrder) {
  const picks = [];
  for (let round = 0; round < 6; round++) {
    const order = round % 2 === 0 ? [...draftOrder] : [...draftOrder].reverse();
    picks.push(...order);
  }
  return picks;
}

window.filterGolfers = function() {
  const q = el('golfer-search').value.toLowerCase();
  const items = document.querySelectorAll('#golfer-list .golfer-item');
  items.forEach((item) => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.pickGolfer = async function(golfer) {
  // Disable all pick buttons immediately to prevent double-taps
  document.querySelectorAll('#golfer-list .golfer-item').forEach((item) => {
    item.classList.add('disabled');
    item.style.pointerEvents = 'none';
  });
  try {
    await api('POST', '/draft/pick', { golfer });
  } catch (e) {
    showToast(e.message, 'error');
  }
  // Always refresh to get the true server state
  navigate('draft');
};

// ── View: My Team ─────────────────────────────────────────────────────────────

async function renderMyTeam(container) {
  const [team, wcData, tournament, wcEligible] = await Promise.all([
    api('GET', `/teams/${state.user}`),
    api('GET', '/wc'),
    api('GET', '/tournament'),
    api('GET', '/wc/eligible'),
  ]);

  const myWC = wcData[state.user];
  const status = tournament?.status;

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">My Team — ${state.user}</h2>`;

  // Draft picks
  html += `
  <div class="card mb-4">
    <div class="section-title">Your 6 Draft Picks</div>
    ${team.length === 0
      ? '<p class="text-gray-400 text-sm">Draft not complete yet.</p>'
      : team.map((g, i) => `
        <div class="flex items-center gap-3 py-2 border-b border-gray-50">
          <span class="text-sm font-bold text-green-700 w-5">${i + 1}</span>
          <span class="text-sm font-medium">${g}</span>
        </div>`).join('')}
  </div>`;

  // WC selection
  if (status === 'wc_selection') {
    if (myWC) {
      html += `
      <div class="card mb-4">
        <div class="section-title">Wild Card Pick</div>
        <div class="alert alert-success">You selected <strong>${myWC}</strong> as your Wild Card. 🎰</div>
        <p class="text-sm text-gray-500">If ${myWC} wins the tournament, you collect $20 from each other player.</p>
      </div>`;
    } else {
      html += `
      <div class="card mb-4">
        <div class="section-title">Pick Your Wild Card</div>
        <div class="alert alert-warning mb-3">Choose one WC golfer from the bottom-50th-percentile eligible list. If they win the tournament, you get $20 from each other player!</div>
        <input type="text" id="wc-search" placeholder="Search…" oninput="filterWC()" class="mb-3" />
        <div id="wc-list" class="max-h-64 overflow-y-auto">
          ${wcEligible.length === 0
            ? '<p class="text-gray-400 text-sm">No WC eligible golfers (admin needs to mark them).</p>'
            : wcEligible.map((g) => `
              <div class="golfer-item" onclick="pickWC('${g.name.replace(/'/g, "\\'")}')">
                <span>${g.name}</span>
                <span class="badge badge-wc">WC eligible</span>
              </div>`).join('')}
        </div>
      </div>`;
    }
  } else if (myWC) {
    html += `
    <div class="card mb-4">
      <div class="section-title">Wild Card Pick</div>
      <div class="flex items-center gap-2">
        <span class="badge badge-wc">WC</span>
        <span class="font-medium">${myWC}</span>
      </div>
      <p class="text-sm text-gray-500 mt-1">If ${myWC} wins the tournament, you collect $20 from each other player.</p>
    </div>`;
  }

  // Other teams WC status
  html += `
  <div class="card">
    <div class="section-title">All Wild Card Picks</div>
    ${Object.entries(wcData).map(([player, wc]) => `
      <div class="flex items-center justify-between py-1.5 border-b border-gray-50">
        <span class="text-sm font-medium">${player}</span>
        ${wc ? `<span class="text-sm text-gray-700">${wc} <span class="badge badge-wc">WC</span></span>` : `<span class="text-sm text-gray-400 italic">Not yet selected</span>`}
      </div>`).join('')}
  </div>`;

  container.innerHTML = html;
}

window.filterWC = function() {
  const q = el('wc-search').value.toLowerCase();
  document.querySelectorAll('#wc-list .golfer-item').forEach((item) => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.pickWC = async function(golfer) {
  if (!confirm(`Pick ${golfer} as your Wild Card?`)) return;
  await api('POST', '/wc/pick', { golfer });
  showToast(`${golfer} is your Wild Card!`, 'success');
  state.tournament = await api('GET', '/tournament');
  navigate('myTeam');
};

// ── View: Leaderboard ─────────────────────────────────────────────────────────

async function renderLeaderboard(container) {
  const [lb, users, tournament] = await Promise.all([
    api('GET', '/leaderboard'),
    api('GET', '/users'),
    api('GET', '/tournament'),
  ]);

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Leaderboard</h2>`;

  // Summary payout table
  const payoutSummary = computePayoutSummary(lb, users);
  html += `
  <div class="card mb-4">
    <div class="section-title">💰 Money Summary</div>
    <table class="score-table w-full">
      <thead><tr>
        <th>Player</th><th>Winnings</th><th>Losses</th><th class="text-right">Net</th>
      </tr></thead>
      <tbody>
        ${users.map((u) => {
          const ps = payoutSummary[u] || { won: 0, lost: 0 };
          const net = ps.won - ps.lost;
          return `<tr>
            <td class="font-medium">${u}${u === state.user ? ' <span class="badge badge-winner">you</span>' : ''}</td>
            <td class="money-positive">+$${ps.won}</td>
            <td class="money-negative">-$${ps.lost}</td>
            <td class="text-right font-bold ${net > 0 ? 'money-positive' : net < 0 ? 'money-negative' : 'money-neutral'}">${net >= 0 ? '+' : ''}$${net}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  // Per-bet sections
  const betDefs = [
    { key: 'day1', label: 'Day 1 — All 6 Golfers' },
    { key: 'day2', label: 'Day 2 — All 6 Golfers' },
    { key: 'day3', label: 'Day 3 — Best 2 Golfers' },
    { key: 'day4', label: 'Day 4 — Best 2 Golfers' },
    { key: 'overall', label: 'Overall — Best 2 Cumulative' },
  ];

  for (const { key, label } of betDefs) {
    const bet = lb[key];
    if (!bet) continue;
    html += renderBetCard(label, bet, users, tournament?.par || 72);
  }

  // WC Daily side bet
  if (lb.wcDaily) {
    const wcDayDefs = [
      { key: 'day1', label: 'Day 1' },
      { key: 'day2', label: 'Day 2' },
      { key: 'day3', label: 'Day 3' },
      { key: 'day4', label: 'Day 4' },
    ];
    for (const { key, label } of wcDayDefs) {
      const wd = lb.wcDaily[key];
      if (!wd) continue;
      html += renderWCDailyCard(label, wd, tournament?.par || 72);
    }
  }

  // WC
  if (lb.wc) {
    const wc = lb.wc;
    html += `
    <div class="card mb-4">
      <div class="section-title">🎰 Wild Card</div>
      ${Object.entries(wc.wcPicks || {}).map(([player, golfer]) => `
        <div class="flex items-center justify-between py-1.5 border-b border-gray-50">
          <span class="text-sm font-medium">${player}</span>
          <span class="text-sm">${golfer || '<span class="text-gray-400 italic">TBD</span>'}</span>
        </div>`).join('')}
      ${wc.resolved ? `
        <div class="mt-3 pt-3 border-t border-gray-100">
          <p class="text-sm"><strong>Tournament winner:</strong> ${wc.tournamentWinners?.join(', ')}</p>
          ${wc.wcWinners?.length ? `
            <div class="alert alert-success mt-2">
              🏆 ${wc.wcWinners.join(' & ')} wins the WC bonus! (+$${wc.wcWinners.length > 0 ? 40 / wc.wcWinners.length * wc.wcWinners.length : 40} per winner)
            </div>` : `<p class="text-sm text-gray-500 mt-1">No WC winner this tournament.</p>`}
        </div>` : `<p class="text-sm text-gray-400 mt-3 italic">WC result revealed when tournament is complete.</p>`}
    </div>`;
  }

  container.innerHTML = html;
}

function renderBetCard(label, bet, users, par) {
  const isWinner = (p) => bet.winner === p || (bet.winners && bet.winners.includes(p));
  const rounds = bet.rounds;

  return `
  <div class="card mb-4">
    <div class="section-title">${label}${bet.partial ? ' <span class="badge badge-wd ml-1">Incomplete</span>' : ''}</div>
    <table class="score-table w-full">
      <thead><tr><th>Player</th><th>Score</th><th>Result</th></tr></thead>
      <tbody>
        ${users.map((u) => {
          const score = bet.scores?.[u];
          const won = isWinner(u);
          const scoreCell = score === null || score === undefined
            ? '<span class="text-gray-400">—</span>'
            : (rounds ? toParStr(score, rounds, par) : score);
          return `<tr>
            <td class="font-medium">${u}${u === state.user ? ' <span class="badge badge-winner text-xs">you</span>' : ''}</td>
            <td>${scoreCell}</td>
            <td>${won && bet.type === 'winner' ? '<span class="badge badge-winner">WIN +$10</span>' : won && bet.type === 'two_way_tie' ? '<span class="badge badge-winner">TIE +$5</span>' : won ? '<span class="badge badge-winner">WIN</span>' : '<span class="text-gray-400 text-xs">-$5</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ${bet.partial ? '<p class="text-xs text-amber-600 mt-2">⚠️ Scores not fully entered — standings may change.</p>' : ''}
    ${bet.type === 'three_way_tie' ? '<p class="text-xs text-gray-500 mt-2">Three-way tie — no payout.</p>' : ''}
  </div>`;
}

function renderWCDailyCard(label, wd, par) {
  let resultHtml = '';
  if (wd.type === 'pending') {
    resultHtml = '<p class="text-sm text-gray-400 italic">Scores pending...</p>';
  } else if (wd.type === 'no_wc_winner') {
    resultHtml = `<p class="text-sm text-gray-500">No WC payout — lowest round (${toParStr(wd.minScore, 1, par)}) by ${wd.lowGolfers.join(', ')}.</p>`;
  } else if (wd.type === 'three_way_tie') {
    resultHtml = '<p class="text-sm text-gray-500">No payout — all WCs tied.</p>';
  } else {
    const payout = wd.wcWinners.length === 1
      ? `${wd.wcWinners[0]} collects $${wd.losers.length * 5}`
      : `${wd.wcWinners.join(' & ')} each collect $5 from ${wd.losers[0]}`;
    resultHtml = `<div class="alert alert-success mt-1">🎯 ${payout}</div>`;
  }

  return `
  <div class="card mb-4">
    <div class="section-title">🎯 WC Daily — ${label}</div>
    ${resultHtml}
  </div>`;
}

function computePayoutSummary(lb, users) {
  const summary = {};
  users.forEach((u) => (summary[u] = { won: 0, lost: 0 }));

  const bets = ['day1', 'day2', 'day3', 'day4', 'overall'];
  for (const key of bets) {
    const bet = lb[key];
    if (!bet || bet.partial || bet.type === 'pending' || bet.type === 'three_way_tie') continue;
    if (bet.type === 'winner') {
      summary[bet.winner].won += 10;
      bet.losers.forEach((l) => { summary[l].lost += 5; });
    } else if (bet.type === 'two_way_tie') {
      bet.winners.forEach((w) => { summary[w].won += 5; });
      if (bet.losers?.[0]) summary[bet.losers[0]].lost += 10;
    }
  }

  // WC Daily
  if (lb.wcDaily) {
    for (const key of ['day1', 'day2', 'day3', 'day4']) {
      const wd = lb.wcDaily[key];
      if (!wd || !wd.wcWinners) continue;
      if (wd.type === 'winner') {
        summary[wd.wcWinners[0]].won += 10;
        wd.losers.forEach((l) => { summary[l].lost += 5; });
      } else if (wd.type === 'two_way_tie') {
        wd.wcWinners.forEach((w) => { summary[w].won += 5; });
        wd.losers.forEach((l) => { summary[l].lost += 10; });
      }
    }
  }

  // WC Tournament
  if (lb.wc?.resolved && lb.wc.wcWinners?.length) {
    lb.wc.wcWinners.forEach((w) => {
      summary[w].won += 40;
      lb.wc.payouts.find((p) => p.winner === w)?.losers.forEach((l) => { summary[l].lost += 20; });
    });
  }

  return summary;
}

// ── View: Scoreboard ──────────────────────────────────────────────────────────

async function renderScoreboard(container) {
  const [scores, teams, wcData, tournament] = await Promise.all([
    api('GET', '/scores'),
    api('GET', '/teams'),
    api('GET', '/wc'),
    api('GET', '/tournament'),
  ]);

  // Build ownership map
  const ownership = {}; // golfer → player
  Object.entries(teams).forEach(([player, golfers]) => {
    golfers.forEach((g) => (ownership[g] = player));
  });

  // Build WC set
  const wcSet = new Set(Object.values(wcData).filter(Boolean));

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Scoreboard</h2>`;

  // Group by owner for display
  const users = await api('GET', '/users');

  for (const user of users) {
    const golfers = teams[user] || [];
    html += `
    <div class="card mb-4">
      <div class="section-title">${user}'s Team${user === state.user ? ' <span class="badge badge-winner ml-1">you</span>' : ''}</div>
      <div class="overflow-x-auto">
        <table class="score-table w-full">
          <thead><tr>
            <th>Golfer</th>
            <th>Day 1</th><th>Day 2</th><th>Day 3</th><th>Day 4</th>
            <th>Total</th>
          </tr></thead>
          <tbody>
            ${golfers.map((g) => {
              const s = scores[g] || {};
              const dayScores = [s.day1, s.day2, s.day3, s.day4];
              const { total, played } = sumPlayed(dayScores);
              return `<tr>
                <td class="font-medium">
                  ${g}
                  ${wcSet.has(g) ? `<span class="badge badge-wc ml-1">WC</span>` : ''}
                </td>
                ${dayScores.map((v) => `<td>${dayCell(v, tournament?.par || 72)}</td>`).join('')}
                <td class="font-semibold">${played ? toParStr(total, played, tournament?.par || 72) : '<span class="text-gray-300">—</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${wcData[user] ? `<p class="text-xs text-amber-600 mt-2">🎰 WC Pick: ${wcData[user]}</p>` : ''}
    </div>`;
  }

  // Undrafted golfers that have scores
  const allDrafted = Object.values(teams).flat();
  const scored = Object.keys(scores).filter((g) => !allDrafted.includes(g) && Object.values(scores[g]).some(Boolean));
  if (scored.length > 0) {
    html += `
    <div class="card mb-4">
      <div class="section-title text-gray-500">Other Golfers</div>
      <div class="overflow-x-auto">
        <table class="score-table w-full">
          <thead><tr><th>Golfer</th><th>Day 1</th><th>Day 2</th><th>Day 3</th><th>Day 4</th><th>Total</th></tr></thead>
          <tbody>
            ${scored.map((g) => {
              const s = scores[g] || {};
              const dayScores = [s.day1, s.day2, s.day3, s.day4];
              const { total, played } = sumPlayed(dayScores);
              return `<tr>
                <td>${g}${wcSet.has(g) ? ' <span class="badge badge-wc">WC</span>' : ''}</td>
                ${dayScores.map((v) => `<td>${dayCell(v, tournament?.par || 72)}</td>`).join('')}
                <td class="font-semibold">${played ? toParStr(total, played, tournament?.par || 72) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

// ── Socket.io ─────────────────────────────────────────────────────────────────

function setupSocket() {
  if (socket) socket.disconnect();
  socket = io();

  socket.on('connect', () => {
    // On reconnect (not first connect), refresh the current view to catch missed events
    if (state._socketConnectedBefore) {
      state.tournament = null;
      refreshCurrentView();
    }
    state._socketConnectedBefore = true;
  });

  socket.on('draft:started', async () => {
    state.tournament = await api('GET', '/tournament');
    showToast('Draft has started!', 'info');
    navigate('draft');
  });

  socket.on('draft:pick', async () => {
    if (state.view === 'draft') navigate('draft');
  });

  socket.on('draft:complete', async () => {
    state.tournament = await api('GET', '/tournament');
    showToast('Draft complete! Select your Wild Card.', 'success');
    navigate('myTeam');
  });

  socket.on('wc:picked', async ({ player }) => {
    showToast(`${player} picked their Wild Card`, 'info');
    if (state.view === 'myTeam') navigate('myTeam');
  });

  socket.on('tournament:advanced', async ({ status }) => {
    state.tournament = await api('GET', '/tournament');
    showToast(`Tournament advanced to ${status}`, 'info');
    if (['leaderboard', 'scoreboard', 'admin'].includes(state.view)) navigate(state.view);
  });

  socket.on('scores:updated', () => {
    if (state.view === 'leaderboard' || state.view === 'scoreboard') navigate(state.view);
  });
}

// Refresh view when phone wakes up / tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) {
    refreshCurrentView();
  }
});

async function refreshCurrentView() {
  try {
    state.tournament = await api('GET', '/tournament');
    const correctView = routeFromStatus(state.tournament?.status);
    // If the tournament status moved past the current view, redirect
    if (state.view === 'draft' && correctView !== 'draft') {
      navigate(correctView);
    } else {
      navigate(state.view);
    }
  } catch {
    // ignore — offline or server down
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const session = await api('GET', '/session');
    if (session.name) {
      state.user = session.name;
      state.tournament = await api('GET', '/tournament');
      document.title = state.tournament?.name || 'Golf Betting';
      setupSocket();
      navigate(routeFromStatus(state.tournament?.status));
    } else {
      navigate('login');
    }
  } catch {
    navigate('login');
  }
}

init();
