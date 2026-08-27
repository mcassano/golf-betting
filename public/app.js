import { isRoundInProgress, parseRel, diffToParStr, toParStr, sumAllRelative, didMissCut } from './scoring-utils.js';

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  user: null,
  role: null,
  tournament: null,
  view: 'login',
};

let socket = null;

// ── Tournament icons ──────────────────────────────────────────────────────────

const ICONS = {
  jacket: `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 12h20v6c0 2-4 4-10 4s-10-2-10-4v-6z" fill="#065f46"/><path d="M22 12l-12 8v20l8 4v-16l4-4v-6z" fill="#047857"/><path d="M42 12l12 8v20l-8 4v-16l-4-4v-6z" fill="#047857"/><path d="M18 28v24h10V40h8v12h10V28l-7-4h-14l-7 4z" fill="#065f46"/><path d="M22 12l-4 6 4 4h20l4-4-4-6" fill="#047857" opacity=".3"/><path d="M10 20l8-4v8l-4 4v16l-4-2V20z" fill="#034e3a"/><path d="M54 20l-8-4v8l4 4v16l4-2V20z" fill="#034e3a"/><rect x="29" y="30" width="6" height="2" rx="1" fill="#a7f3d0"/><rect x="29" y="35" width="6" height="2" rx="1" fill="#a7f3d0"/><rect x="29" y="40" width="6" height="2" rx="1" fill="#a7f3d0"/><path d="M22 12c0-2 4-4 10-4s10 2 10 4" stroke="#034e3a" stroke-width="1" fill="none"/></svg>`,

  // Wanamaker Trophy – gold two-handled cup (PGA Championship)
  wanamaker: `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="57" width="28" height="5" rx="2" fill="#78350f"/><rect x="23" y="50" width="18" height="7" rx="1" fill="#92400e"/><rect x="28" y="40" width="8" height="10" fill="#b45309"/><path d="M13 14 Q12 40 32 40 Q52 40 51 14 Z" fill="#fbbf24"/><ellipse cx="32" cy="14" rx="19" ry="5" fill="#f59e0b"/><path d="M13 19 Q3 21 3 30 Q3 39 13 37" stroke="#d97706" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M51 19 Q61 21 61 30 Q61 39 51 37" stroke="#d97706" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="14" rx="10" ry="2.5" fill="#fde68a" opacity="0.6"/><path d="M20 20 Q22 16 27 20" stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/></svg>`,

  // Claret Jug – dark red jug with handle and spout (The Open Championship)
  claret: `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="32" cy="59" rx="13" ry="4" fill="#7f1d1d"/><path d="M21 26 Q19 57 32 57 Q45 57 43 26 Z" fill="#991b1b"/><rect x="26" y="11" width="12" height="16" rx="3" fill="#7f1d1d"/><ellipse cx="32" cy="11" rx="9" ry="3.5" fill="#b91c1c"/><ellipse cx="32" cy="9" rx="5" ry="2" fill="#dc2626"/><circle cx="32" cy="7" r="2" fill="#b91c1c"/><path d="M43 32 Q55 30 55 40 Q55 50 43 50" stroke="#7f1d1d" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M21 28 Q11 25 8 20" stroke="#7f1d1d" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M25 30 Q26 25 29 30" stroke="#fca5a5" stroke-width="1.5" fill="none" opacity="0.5"/></svg>`,

  // US Open Trophy – silver two-handled cup
  usopen: `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="57" width="28" height="5" rx="2" fill="#334155"/><rect x="23" y="50" width="18" height="7" rx="1" fill="#475569"/><rect x="28" y="40" width="8" height="10" fill="#64748b"/><path d="M13 14 Q12 40 32 40 Q52 40 51 14 Z" fill="#e2e8f0"/><ellipse cx="32" cy="14" rx="19" ry="5" fill="#cbd5e1"/><path d="M13 19 Q3 21 3 30 Q3 39 13 37" stroke="#94a3b8" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M51 19 Q61 21 61 30 Q61 39 51 37" stroke="#94a3b8" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="14" rx="10" ry="2.5" fill="white" opacity="0.5"/><path d="M20 20 Q22 16 27 20" stroke="white" stroke-width="1.5" fill="none" opacity="0.6"/><path d="M26 28 v8 M32 26 v10 M38 28 v8" stroke="#94a3b8" stroke-width="1" opacity="0.5"/></svg>`,

  // FedEx Cup – silver chalice cradling a giant dimpled golf ball (TOUR Championship)
  fedex: `<svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="57" width="28" height="5" rx="2" fill="#334155"/><rect x="24" y="51" width="16" height="6" rx="1" fill="#475569"/><rect x="29" y="42" width="6" height="9" fill="#94a3b8"/><path d="M20 34 Q20 44 32 44 Q44 44 44 34 L44 30 L20 30 Z" fill="#cbd5e1"/><path d="M20 32 Q14 32 14 38" stroke="#94a3b8" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M44 32 Q50 32 50 38" stroke="#94a3b8" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="32" cy="20" r="14" fill="#f8fafc"/><circle cx="32" cy="20" r="14" stroke="#cbd5e1" stroke-width="1"/><path d="M24 12 Q28 8 34 9" stroke="white" stroke-width="2" fill="none" opacity="0.9" stroke-linecap="round"/><g fill="#cbd5e1"><circle cx="27" cy="16" r="1.2"/><circle cx="33" cy="15" r="1.2"/><circle cx="39" cy="17" r="1.2"/><circle cx="24" cy="21" r="1.2"/><circle cx="30" cy="21" r="1.2"/><circle cx="36" cy="22" r="1.2"/><circle cx="42" cy="22" r="1.1"/><circle cx="27" cy="26" r="1.2"/><circle cx="33" cy="27" r="1.2"/><circle cx="39" cy="27" r="1.1"/></g><ellipse cx="32" cy="44" rx="6" ry="1.5" fill="#94a3b8" opacity="0.6"/></svg>`,
};

function getTournamentIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('pga championship')) return ICONS.wanamaker;
  if (n.includes('u.s. open') || n.includes('us open') || n.includes('united states open')) return ICONS.usopen;
  if (n.includes('the open') || n.includes('open championship') || n.includes('british open')) return ICONS.claret;
  if (n.includes('tour championship') || n.includes('fedex')) return ICONS.fedex;
  return ICONS.jacket; // Masters or default
}

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

function stripOdds(name) { return name.replace(/\s\+\d+$/, ''); }

// Render a round score with thru info.
// Completed: "-5 F 67"  In-progress: "-3 thru 12"  Not started: "—"
function dayCell(v, par, thru, rel, missedCut = false) {
  if (missedCut) return '<span class="badge badge-cut" title="Missed cut">CUT</span>';
  if (v === undefined || v === null || v === '') return '<span class="text-gray-300">—</span>';
  if (v === 'CUT') return '<span class="badge badge-cut">CUT</span>';
  if (v === 'WD') return '<span class="badge badge-wd">WD</span>';
  const n = parseInt(v, 10);
  if (isNaN(n)) return `${v}`;

  // Use ESPN's relative-to-par when available; fall back to computing from full par
  const diff = n - par;
  const computedRel = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;

  const relStr = rel || computedRel;
  const color = relStr.startsWith('-') ? 'text-red-600' : '';

  if (isRoundInProgress(thru)) {
    return `<span class="${color}">${relStr}</span> <span class="text-gray-400 text-xs">thru ${thru}</span>`;
  } else if (thru) {
    return `<span class="${color}">${relStr}</span> <span class="text-gray-400 text-xs">F ${n}</span>`;
  }
  // Fallback: no thru data, show relative + raw score (same format as completed)
  return `<span class="${color}">${relStr}</span> <span class="text-gray-400 text-xs">F ${n}</span>`;
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
  if (status === 'wc_selection') return 'bets';
  if (status === 'mc_pick') return 'bets';
  return 'scoreboard';
}

function navigate(view) {
  state.view = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
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

  if (state.role === 'patron') {
    el('nav-links').innerHTML = `
      <button onclick="navigate('bets')" class="nav-link ${state.view === 'bets' ? 'active' : ''}">Bets</button>
      <button onclick="navigate('scoreboard')" class="nav-link ${state.view === 'scoreboard' ? 'active' : ''}">Scoreboard</button>`;
    return;
  }

  const status = state.tournament?.status;
  const links = [
    { view: 'admin', label: 'Admin', always: true },
    { view: 'bets', label: 'Bets', always: true },
    { view: 'draft', label: 'Draft', show: ['drafting', 'wc_selection', 'day1', 'day2', 'day3', 'day4', 'complete'] },
    { view: 'scoreboard', label: 'Scoreboard', show: ['day1', 'day2', 'day3', 'day4', 'complete'] },
  ];

  const navLinks = links
    .filter((l) => l.always || (l.show && l.show.includes(status)))
    .map((l) => `<button onclick="navigate('${l.view}')" class="nav-link ${state.view === l.view ? 'active' : ''}">${l.label}</button>`)
    .join('');

  const lastSync = state.tournament?.lastEspnSync;
  const activeDays = ['day1', 'day2', 'day3', 'day4'];
  let syncLabel = '';
  if (lastSync && activeDays.includes(status)) {
    const mins = Math.floor((Date.now() - new Date(lastSync).getTime()) / 60000);
    syncLabel = `<span class="text-green-300 text-xs ml-3">ESPN updated ${mins === 0 ? 'just now' : `${mins}m ago`}</span>`;
  }

  el('nav-links').innerHTML = navLinks + syncLabel;
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderApp() {
  if (state.role === 'patron' && !['login', 'scoreboard', 'bets'].includes(state.view)) state.view = 'scoreboard';
  renderNav();
  const app = el('app');
  const views = { login: renderLogin, admin: renderAdmin, bets: renderBets, draft: renderDraft, scoreboard: renderScoreboard };
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
      users.map((u) => `<option value="${u}">${u}</option>`).join('') +
      '<option value="Patron">Patron</option>';
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
    const resp = await api('POST', '/session', { name, pin });
    state.user = resp.name;
    state.role = resp.role || 'user';
    state.tournament = await api('GET', '/tournament');
    document.title = state.tournament?.name || 'Golf Betting';
    setupSocket();
    navigate(state.role === 'patron' ? 'scoreboard' : routeFromStatus(state.tournament?.status));
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
  state.role = null;
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
        <label class="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input type="checkbox" ${tournament?.noCut ? 'checked' : ''} onchange="toggleNoCut(this.checked)" />
          No cut this week (e.g. TOUR Championship)
        </label>
        <p class="text-xs text-gray-400 mt-1">Everyone plays four rounds: no cut line, no missed-cut side bet, and the missed-cut pick phase is skipped.</p>
      </div>` : ''}
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
    const par = tournament?.par || 72;
    // Infinity for no-cut events so didMissCut can never fire off the +4 default
    const cutLine = tournament?.noCut ? Infinity : (Number.isFinite(tournament?.cutLine) ? tournament.cutLine : 4);
    const rows = draftedPlayers.map((p) => {
      const s = scores[p.name] || {};
      const missedCut = didMissCut(s, par, cutLine);
      const cells = [1, 2, 3, 4].map((d) => {
        const val = s[`day${d}`] || '';
        const thru = s[`day${d}Thru`];
        const isActive = d === currentDay;
        const isInProgress = val && val !== 'CUT' && val !== 'WD' && thru && thru !== 'F' && thru !== '18';
        const borderColor = isInProgress ? 'border-yellow-400 bg-yellow-50' : isActive ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white';
        const isR34MissedCut = missedCut && (d === 3 || d === 4);
        const tdCls = 'p-1';
        return `<td class="${tdCls}">
          <div class="relative inline-block">
            <input
              type="text"
              data-golfer="${p.name.replace(/"/g, '&quot;')}"
              data-day="${d}"
              value="${val}"
              placeholder="${isR34MissedCut ? 'CUT' : (isActive ? '—' : '')}"
              onblur="saveScoreCell(this)"
              onkeydown="scoreGridKeydown(event, this)"
              class="score-cell w-16 text-center border rounded px-1 py-0.5 text-sm font-mono ${borderColor} ${val === 'CUT' || val === 'WD' ? 'text-red-500' : ''}"
            />${isInProgress ? `<span class="absolute -top-2 -right-2 text-[10px] bg-yellow-400 text-yellow-900 rounded-full px-1 font-bold leading-tight">${thru}</span>` : ''}
          </div>
        </td>`;
      }).join('');
      const alreadyWD = s[`day${currentDay}`] === 'WD';
      return `<tr class="border-b border-gray-50">
        <td class="py-1 pr-3 text-sm font-medium text-gray-700 whitespace-nowrap">
          ${p.name}
          ${alreadyWD ? '' : `<button onclick="markAsWD('${p.name.replace(/'/g, "\\'")}', ${currentDay})" class="ml-2 text-xs text-gray-400 hover:text-red-600 border border-gray-300 hover:border-red-400 rounded px-1 py-0.5 font-normal" title="Mark as Withdrawn">WD &#x2715;</button>`}
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

  // ── ESPN (name filter always visible after setup; polling controls only on active days)
  if (status && status !== 'setup') {
    const espn = await api('GET', '/admin/espn/status').catch(() => null);
    const polling = !!espn?.polling;
    const last = espn?.lastPollTime ? new Date(espn.lastPollTime).toLocaleString() : 'never';
    const isActiveDay = ['day1', 'day2', 'day3', 'day4'].includes(status);
    html += `
    <div class="card mb-4">
      <div class="section-title">ESPN</div>
      <div class="mb-3">
        <label class="block text-xs font-medium text-gray-500 mb-1">Event Name Filter</label>
        <div class="flex gap-2">
          <input type="text" id="espn-name" value="${espn?.espnName || ''}" placeholder="e.g. PGA Championship" class="flex-1 text-sm" />
          <button onclick="saveEspnName()" class="btn btn-secondary btn-sm">Save</button>
        </div>
        <p class="text-xs text-gray-400 mt-1">Matches against ESPN's event name/shortName so the right tournament is picked when multiple events are listed.</p>
      </div>
      ${isActiveDay ? `
      <div class="text-sm text-gray-600 mb-2">
        Polling: <span class="${polling ? 'text-green-700' : 'text-gray-500'} font-medium">${polling ? 'on' : 'off'}</span>
        · last poll: <span class="font-mono text-xs">${last}</span>
      </div>
      <div class="flex gap-2">
        ${polling
          ? `<button onclick="stopEspnPolling()" class="btn btn-secondary btn-sm">Stop Polling</button>`
          : `<button onclick="startEspnPolling()" class="btn btn-primary btn-sm">Start Polling</button>`}
        <button onclick="syncEspnNow()" class="btn btn-secondary btn-sm">Sync Now</button>
      </div>` : ''}
    </div>`;
  }

  // ── Tournament par (always editable when a tournament exists)
  if (status) {
    html += `
    <div class="card mb-4">
      <div class="section-title">Course Par</div>
      <div class="flex gap-2 items-center">
        <input type="number" id="t-par" value="${tournament?.par ?? 72}" min="1" style="width:5rem" />
        <button onclick="saveTournamentPar()" class="btn btn-secondary btn-sm">Save Par</button>
        <span class="text-xs text-gray-400">Used to derive "to par" displays from raw scores.</span>
      </div>
    </div>`;
  }

  // ── Advance tournament status
  const nextStatus = { setup: null, drafting: null, wc_selection: null, day1: 'day2', day2: 'day3', day3: 'day4', day4: 'complete', complete: null };
  const nextLabels = { day2: 'Advance to Day 2', day3: 'Advance to Day 3', day4: 'Advance to Day 4', complete: 'Mark Tournament Complete' };
  if (status && nextStatus[status]) {
    const advancingToDay3 = nextStatus[status] === 'day3' && !tournament?.noCut;
    html += `
    <div class="card mb-4">
      <div class="section-title">Tournament Status: <span class="text-green-700">${status}</span>${tournament?.noCut ? ' <span class="text-xs font-normal text-gray-400 ml-1">(no-cut event)</span>' : ''}</div>
      ${advancingToDay3 ? `
      <div class="mb-2">
        <label class="block text-sm font-medium text-gray-700 mb-1">Cut line (to par) — required</label>
        <input id="cut-line-input" type="number" step="1" placeholder="e.g. 4"
          class="border rounded px-2 py-1 w-24" />
        <p class="text-xs text-gray-400 mt-1">Scores at or below this made the cut. R1+R2 worse than the line counts as a missed cut.</p>
      </div>` : ''}
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

window.saveEspnName = async function() {
  const espnName = el('espn-name').value.trim();
  await api('POST', '/admin/espn/name', { espnName });
  showToast('ESPN event name saved', 'success');
};

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

window.toggleNoCut = async function(noCut) {
  await api('POST', '/admin/tournament/nocut', { noCut });
  state.tournament = await api('GET', '/tournament');
  showToast(noCut ? 'No-cut event: cut line and missed-cut bet disabled' : 'Cut re-enabled', 'success');
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
  const body = { status };
  if (status === 'day3' && !state.tournament?.noCut) {
    const raw = document.getElementById('cut-line-input')?.value;
    const cutLine = parseInt(raw, 10);
    if (!Number.isFinite(cutLine)) {
      showToast('Enter the cut line (to par) before advancing to Day 3', 'error');
      return;
    }
    if (!confirm(`Advance to Day 3 with cut line ${cutLine >= 0 ? '+' : ''}${cutLine} to par?`)) return;
    body.cutLine = cutLine;
  } else if (!confirm(`Advance tournament to ${status}?`)) {
    return;
  }
  await api('POST', '/admin/tournament/advance', body);
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
    html += `<div class="alert alert-success">Draft is complete! <button onclick="navigate('bets')" class="underline ml-1">Go to Bets →</button></div>`;
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
  if (!confirm(`Draft ${golfer}?`)) return;
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

// ── View: Bets ───────────────────────────────────────────────────────────────

async function renderBets(container) {
  const [players, teams, wcData, mcData, tournament, wcEligible, mcEligible] = await Promise.all([
    api('GET', '/players'),
    api('GET', '/teams'),
    api('GET', '/wc'),
    api('GET', '/missedcut').catch(() => ({})),
    api('GET', '/tournament'),
    api('GET', '/wc/eligible').catch(() => []),
    api('GET', '/missedcut/eligible').catch(() => []),
  ]);

  const ownership = {};
  Object.entries(teams).forEach(([player, golfers]) => {
    (golfers || []).forEach((g) => (ownership[g] = player));
  });

  const status = tournament?.status;
  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Bets &amp; Rules</h2>`;

  // ── WC pick (wc_selection phase) ─────────────────────────────────────────
  if (status === 'wc_selection') {
    const myWC = wcData[state.user];
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
            : wcEligible.map((g) => {
              const takenBy = Object.entries(wcData).find(([, v]) => v === g.name);
              if (takenBy) {
                return `<div class="golfer-item disabled opacity-50 pointer-events-none">
                  <span>${g.name}</span>
                  <span class="text-xs text-gray-400">Picked by ${takenBy[0]}</span>
                </div>`;
              }
              return `<div class="golfer-item" onclick="pickWC('${g.name.replace(/'/g, "\\'")}')">
                <span>${g.name}</span>
                <span class="badge badge-wc">WC eligible</span>
              </div>`;
            }).join('')}
        </div>
      </div>`;
    }
  }

  // ── MC pick (mc_pick phase) ───────────────────────────────────────────────
  if (status === 'mc_pick') {
    const myMCPick = mcData[state.user];
    const mcGolfers = mcEligible.golfers || [];
    const mcSequence = mcEligible.sequence || [];
    if (myMCPick) {
      html += `
      <div class="card mb-4">
        <div class="section-title">🎲 Missed Cut Pick</div>
        <div class="alert alert-success">You selected <strong>${myMCPick}</strong> to miss the cut.</div>
      </div>`;
    } else {
      let validRange = null;
      let constraintDesc = "You're first! Your pick anchors the range for everyone else.";
      if (mcSequence.length === 1) {
        const anchorIdx = mcGolfers.findIndex((g) => g.name === mcSequence[0]);
        validRange = { low: Math.max(0, anchorIdx - 2), high: Math.min(mcGolfers.length - 1, anchorIdx + 2) };
        constraintDesc = `Must be within 2 spots of <strong>${mcSequence[0]}</strong> (positions ${validRange.low + 1}–${validRange.high + 1}).`;
      } else if (mcSequence.length === 2) {
        const idx0 = mcGolfers.findIndex((g) => g.name === mcSequence[0]);
        const idx1 = mcGolfers.findIndex((g) => g.name === mcSequence[1]);
        const minIdx = Math.min(idx0, idx1);
        const maxIdx = Math.max(idx0, idx1);
        validRange = { low: Math.max(0, minIdx - 1), high: Math.min(mcGolfers.length - 1, maxIdx + 1) };
        constraintDesc = `Must be within 1 spot of the established range (positions ${validRange.low + 1}–${validRange.high + 1}).`;
      }
      const alreadyPickedNames = new Set(Object.values(mcData));
      html += `
      <div class="card mb-4">
        <div class="section-title">🎲 Pick Your Missed Cut Golfer</div>
        <div class="alert alert-warning mb-3">${constraintDesc}</div>
        <input type="text" id="mc-search" placeholder="Search…" oninput="filterMC()" class="mb-3" />
        <div id="mc-list" class="max-h-64 overflow-y-auto">
          ${mcGolfers.length === 0
            ? '<p class="text-gray-400 text-sm">No eligible golfers.</p>'
            : mcGolfers.map((g, i) => {
                const inRange = !validRange || (i >= validRange.low && i <= validRange.high);
                const taken = alreadyPickedNames.has(g.name);
                const clickable = inRange && !taken;
                const badge = taken
                  ? '<span class="text-xs text-gray-400">taken</span>'
                  : !inRange
                    ? '<span class="text-xs text-gray-400">out of range</span>'
                    : '';
                return `<div class="golfer-item${!clickable ? ' disabled opacity-50 pointer-events-none' : ''}" onclick="${clickable ? `pickMC('${g.name.replace(/'/g, "\\'")}')` : ''}">
                  <span class="text-xs text-gray-300 w-6 shrink-0">${i + 1}</span>
                  <span>${g.name}</span>
                  ${badge}
                </div>`;
              }).join('')}
        </div>
      </div>`;
    }
  }

  // Day 1 & 2
  html += `
  <div class="card mb-4">
    <div class="section-title">Days 1 &amp; 2 — Best 6</div>
    <p class="text-sm text-gray-700 mb-2">Each player's <strong>best 6 drafted golfers</strong> count toward their daily score. If any team has a withdrawal, all teams drop to best-of (6 minus max WDs) to keep it fair.</p>
    <div class="text-sm text-gray-600">
      <p><strong>Payout:</strong> Winner collects $5 from each loser (+$10 total).</p>
    </div>
  </div>`;

  // Day 3 & 4
  html += `
  <div class="card mb-4">
    <div class="section-title">Days 3 &amp; 4 — Best 2</div>
    <p class="text-sm text-gray-700 mb-2">Only each player's <strong>best 2 drafted golfers</strong> count. No WD adjustment on these days.</p>
    <div class="text-sm text-gray-600">
      <p><strong>Payout:</strong> Same as Days 1 &amp; 2 — winner collects $5 from each loser.</p>
    </div>
  </div>`;

  // Overall
  html += `
  <div class="card mb-4">
    <div class="section-title">Overall — Best 2 Cumulative</div>
    <p class="text-sm text-gray-700 mb-2">Best 2 golfers by <strong>cumulative 4-day total</strong> (8 rounds per team).</p>
    <div class="text-sm text-gray-600">
      <p><strong>Payout:</strong> Winner collects $5 from each loser.</p>
    </div>
  </div>`;

  // Ties
  html += `
  <div class="card mb-4">
    <div class="section-title">Tie Rules</div>
    <ul class="text-sm text-gray-700 space-y-1 list-disc list-inside">
      <li><strong>2-way tie:</strong> Both winners collect $5 from the loser.</li>
      <li><strong>3-way tie:</strong> No payout.</li>
    </ul>
  </div>`;

  // WC Daily
  html += `
  <div class="card mb-4">
    <div class="section-title">🎰 Wild Card — Daily Side Bet</div>
    <p class="text-sm text-gray-700 mb-2">Each day, all 21 selected golfers (18 drafted + 3 WC) are compared. If a WC golfer posts the <strong>sole lowest round</strong>, their owner collects $5 from each opponent.</p>
    <ul class="text-sm text-gray-600 space-y-1 list-disc list-inside">
      <li>If multiple WC golfers tie at the low, they split the winnings.</li>
      <li>If <em>any</em> drafted golfer ties at the low with a WC golfer, the WC payout is <strong>voided</strong>.</li>
    </ul>
  </div>`;

  // WC Tournament
  html += `
  <div class="card mb-4">
    <div class="section-title">🎰 Wild Card — Tournament Bet</div>
    <p class="text-sm text-gray-700 mb-2">If your WC golfer <strong>wins the tournament outright</strong>, you collect <strong>$20 from each other player</strong>.</p>
    <div class="text-sm text-gray-600">
      ${Object.entries(wcData).map(([player, golfer]) =>
        `<p>${player}: <strong>${golfer || 'TBD'}</strong></p>`
      ).join('')}
    </div>
  </div>`;

  // Missed Cut Side Bet (not offered in no-cut events)
  if (tournament?.noCut) {
    html += `
  <div class="card mb-4">
    <div class="section-title">🎲 Missed Cut Side Bet</div>
    <p class="text-sm text-gray-500">No cut this week — everyone plays four rounds, so there's no missed-cut bet.</p>
  </div>`;
  } else {
    html += `
  <div class="card mb-4">
    <div class="section-title">🎲 Missed Cut Side Bet</div>
    <p class="text-sm text-gray-700 mb-2">Each player picked one golfer they think will miss the cut.</p>
    <div class="text-sm text-gray-600">
      ${Object.entries(mcData).map(([player, golfer]) =>
        `<p>${player}: <strong>${golfer}</strong></p>`
      ).join('')}
    </div>
  </div>`;
  }

  // CUT / WD
  html += `
  <div class="card mb-4">
    <div class="section-title">CUT &amp; Withdrawal Scoring</div>
    <ul class="text-sm text-gray-700 space-y-1 list-disc list-inside">
      ${tournament?.noCut ? '' : '<li><strong>Missed Cut (CUT):</strong> 99-stroke penalty per remaining day.</li>'}
      <li><strong>Withdrawal (WD):</strong> Excluded from scoring entirely. Days 1–2 adjust best-N down for all teams.</li>
    </ul>
  </div>`;

  // Field list
  if (players && players.length > 0) {
    html += `
    <div class="card mb-4">
      <div class="section-title">Tournament Field (${players.length} Golfers)</div>
      <input type="text" id="field-search" placeholder="Search golfers…" oninput="filterField()" class="mb-3" />
      <div id="field-list" class="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
        ${players.map((p) => {
          const owner = ownership[p.name];
          const wcOwner = Object.entries(wcData).find(([, g]) => g === p.name);
          return `<div class="field-item flex items-center justify-between py-1 text-sm border-b border-gray-50">
            <span class="font-medium">${p.name}${p.wcEligible ? ' <span class="badge badge-wc text-[10px]">WC</span>' : ''}</span>
            <span class="text-xs text-gray-400">${owner ? owner : ''}${wcOwner ? ` <span class="badge badge-wc text-[10px]">${wcOwner[0]}'s WC</span>` : ''}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

window.filterField = function() {
  const q = el('field-search').value.toLowerCase();
  document.querySelectorAll('#field-list .field-item').forEach((item) => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

// ── WC / MC pick helpers ──────────────────────────────────────────────────────

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
  navigate('bets');
};

window.filterMC = function() {
  const q = el('mc-search').value.toLowerCase();
  document.querySelectorAll('#mc-list .golfer-item').forEach((item) => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.pickMC = async function(golfer) {
  if (!confirm(`Pick ${golfer} to miss the cut?`)) return;
  await api('POST', '/missedcut/pick', { golfer });
  showToast(`${golfer} is your missed cut pick!`, 'success');
  state.tournament = await api('GET', '/tournament');
  navigate('bets');
};

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

  // Missed Cut
  const mc = lb.missedCut;
  if (mc?.resolved && mc.type !== 'no_winner' && mc.type !== 'three_way_tie') {
    if (mc.type === 'winner') {
      summary[mc.winner].won += mc.losers.length * 5;
      mc.losers.forEach((l) => { summary[l].lost += 5; });
    } else if (mc.type === 'two_way_tie') {
      mc.winners.forEach((w) => { summary[w].won += 5; });
      mc.losers.forEach((l) => { summary[l].lost += 10; });
    }
  }

  return summary;
}

// ── View: Scoreboard ──────────────────────────────────────────────────────────

async function renderScoreboard(container) {
  const [scores, teams, wcData, tournament, lb] = await Promise.all([
    api('GET', '/scores'),
    api('GET', '/teams'),
    api('GET', '/wc'),
    api('GET', '/tournament'),
    api('GET', '/leaderboard').catch(() => ({})),
  ]);
  const mcData = lb.missedCut?.picks || {};

  // Build ownership map
  const ownership = {}; // golfer → player
  Object.entries(teams).forEach(([player, golfers]) => {
    golfers.forEach((g) => (ownership[g] = player));
  });

  // Build WC set
  const wcSet = new Set(Object.values(wcData).filter(Boolean));

  let html = `<h2 class="text-2xl font-bold text-green-800 mb-4">Scoreboard</h2>`;

  // Bet winners summary
  const par = tournament?.par || 72;
  // Infinity for no-cut events so didMissCut can never fire off the +4 default
  const cutLine = tournament?.noCut ? Infinity : (Number.isFinite(tournament?.cutLine) ? tournament.cutLine : 4);
  const relStr = (score, rounds) => {
    const diff = score - rounds * par;
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const betLabels = [
    { key: 'day1', label: 'Day 1' },
    { key: 'day2', label: 'Day 2' },
    { key: 'day3', label: 'Day 3' },
    { key: 'day4', label: 'Day 4' },
    { key: 'overall', label: 'Overall' },
  ];
  const wcDayLabels = [
    { key: 'day1', label: 'WC Day 1' },
    { key: 'day2', label: 'WC Day 2' },
    { key: 'day3', label: 'WC Day 3' },
    { key: 'day4', label: 'WC Day 4' },
  ];
  const hasBets = betLabels.some(({ key }) => lb[key]);
  const hasWCDaily = lb.wcDaily && wcDayLabels.some(({ key }) => lb.wcDaily[key]);
  if (hasBets || hasWCDaily) {
    // Collect all users sorted by score for each bet
    const users = await api('GET', '/users');

    // Pre-compute sorted results per bet
    const betResults = {};
    for (const { key } of betLabels) {
      const bet = lb[key];
      if (bet && bet.scores && bet.type !== 'pending' && bet.type !== 'three_way_tie') {
        const sorted = Object.entries(bet.scores)
          .filter(([, s]) => s !== null)
          .sort(([, a], [, b]) => a - b);
        const winnerNames = bet.type === 'winner' ? [bet.winner] : bet.winners;
        betResults[key] = sorted.map(([player, score]) => ({
          player, score, isWin: winnerNames.includes(player),
        }));
      }
    }

    // Count winner icons per user
    const jacketCounts = {};
    for (const u of users) jacketCounts[u] = 0;
    const jacketBetKeys = ['day1', 'day2', 'day3', 'day4', 'overall'];
    for (const key of jacketBetKeys) {
      const bet = lb[key];
      if (!bet) continue;
      if (bet.type === 'winner') { if (jacketCounts[bet.winner] !== undefined) jacketCounts[bet.winner]++; }
      else if (bet.type === 'two_way_tie') { for (const w of bet.winners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; } }
    }
    const wcDailyMap = lb.wcDaily || {};
    for (const key of Object.keys(wcDailyMap)) {
      const wd = wcDailyMap[key];
      if (wd?.wcWinners && (wd.type === 'winner' || wd.type === 'two_way_tie')) {
        for (const w of wd.wcWinners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; }
      }
    }
    if (lb.wc?.resolved && lb.wc.wcWinners) {
      for (const w of lb.wc.wcWinners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; }
    }
    const mcBet = lb.missedCut;
    if (mcBet?.resolved && mcBet.type !== 'no_winner' && mcBet.type !== 'three_way_tie') {
      const mcWinners = mcBet.type === 'winner' ? [mcBet.winner] : mcBet.winners || [];
      for (const w of mcWinners) { if (jacketCounts[w] !== undefined) jacketCounts[w]++; }
    }

    const totalJackets = Object.values(jacketCounts).reduce((a, b) => a + b, 0);

    html += `<div class="card mb-4"><div class="section-title">Bet Winners</div>`;

    const winnerIcon = getTournamentIcon(state.tournament?.name);

    if (totalJackets > 0) {
      html += `<div style="display:flex;gap:16px;margin-bottom:16px;padding:12px;background:white;border-radius:8px">`;
      for (const u of users) {
        const count = jacketCounts[u];
        if (count > 0) {
          html += `<div style="text-align:center;flex:1">`;
          html += `<div style="display:flex;justify-content:center;gap:2px">${winnerIcon.repeat(count)}</div>`;
          html += `<div style="color:#065f46;font-size:11px;font-weight:600;margin-top:4px">${u} — ${count}</div>`;
          html += `</div>`;
        } else {
          html += `<div style="text-align:center;flex:1">`;
          html += `<div style="color:#9ca3af;font-size:11px;font-weight:600">${u} — 0</div>`;
          html += `</div>`;
        }
      }
      html += `</div>`;
    }

    html += `<div class="overflow-x-auto"><table class="score-table w-full" style="table-layout:fixed">`;
    html += `<colgroup><col style="width:40px">`;
    for (let i = 0; i < betLabels.length; i++) html += `<col>`;
    html += `</colgroup>`;
    html += `<thead><tr><th></th>`;
    for (const { label } of betLabels) html += `<th>${label}</th>`;
    html += `</tr></thead><tbody>`;

    // One row per placement (1st, 2nd, 3rd)
    const maxPlayers = users.length;
    for (let rank = 0; rank < maxPlayers; rank++) {
      html += `<tr>`;
      html += `<td class="text-xs text-gray-400">${rank === 0 ? '1st' : rank === 1 ? '2nd' : '3rd'}</td>`;
      for (const { key } of betLabels) {
        const bet = lb[key];
        const results = betResults[key];
        if (!bet) {
          html += `<td class="text-gray-300 text-sm">—</td>`;
        } else if (bet.type === 'pending') {
          html += `<td class="text-sm">${rank === 0 ? '<span class="italic text-gray-400">pending</span>' : '<span class="text-gray-300">—</span>'}</td>`;
        } else if (bet.type === 'three_way_tie') {
          html += `<td class="text-sm">${rank === 0 ? '<span class="text-gray-500">3-way tie</span>' : ''}</td>`;
        } else if (results && rank < results.length) {
          const { player, score, isWin } = results[rank];
          const cls = isWin ? 'text-green-700 font-semibold' : 'text-gray-700';
          html += `<td class="${cls} text-sm">${player} ${relStr(score, bet.rounds)}</td>`;
        } else {
          html += `<td></td>`;
        }
      }
      html += `</tr>`;
    }
    // WC Daily rows in the same table
    if (hasWCDaily) {
      html += `<tr><td colspan="6" class="border-t border-gray-100"></td></tr>`;
      html += `<tr><th></th>`;
      for (const { label } of wcDayLabels) html += `<th>${label}</th>`;
      html += `<th>WC Overall</th></tr>`;
      html += `<tr><td></td>`;
      for (const { key } of wcDayLabels) {
        const wd = lb.wcDaily?.[key];
        if (!wd || wd.type === 'pending') {
          html += `<td class="text-gray-400 italic text-sm">pending</td>`;
        } else if (wd.type === 'no_wc_winner') {
          let cell = `<div class="text-gray-500 text-sm">No winner</div>`;
          cell += `<div class="text-xs text-gray-400">Low: ${stripOdds(wd.lowGolfers[0])} ${relStr(wd.minScore, 1)}</div>`;
          if (wd.lowestWC) {
            cell += `<div class="text-xs text-gray-400">Low WC: ${stripOdds(wd.lowestWC.golfer)} ${relStr(wd.lowestWC.score, 1)}</div>`;
          }
          html += `<td>${cell}</td>`;
        } else if (wd.type === 'three_way_tie') {
          html += `<td class="text-gray-500 text-sm">3-way tie</td>`;
        } else {
          html += `<td class="text-green-700 font-semibold text-sm">${wd.wcWinners.join(' & ')}</td>`;
        }
      }
      const wc = lb.wc;
      if (!wc || !wc.resolved) {
        html += `<td class="text-gray-400 italic text-sm">pending</td>`;
      } else if (wc.wcWinners?.length) {
        html += `<td class="text-green-700 font-semibold text-sm">${wc.wcWinners.join(' & ')}</td>`;
      } else {
        html += `<td class="text-gray-500 text-sm">No winner</td>`;
      }
      html += `</tr>`;
    }

    // Missed Cut rows — one line per picker showing their golfer's R1+R2 result,
    // mirroring the detail shown for the other bets.
    if (mcBet && Object.keys(mcBet.picks || {}).length > 0) {
      html += `<tr><td colspan="${betLabels.length + 1}" class="border-t border-gray-100"></td></tr>`;
      html += `<tr><th></th><th colspan="${betLabels.length}">Missed Cut</th></tr>`;
      const mcWinners = mcBet.type === 'winner' ? [mcBet.winner] : (mcBet.winners || []);
      for (const [user, golfer] of Object.entries(mcBet.picks)) {
        const s = scores[golfer] || {};
        const { diff, count } = sumAllRelative([s.day1, s.day2], [s.day1Thru, s.day2Thru], [s.day1Rel, s.day2Rel], par);
        const missed = didMissCut(s, par, cutLine);
        const isWin = mcWinners.includes(user);
        const r1r2 = count ? `R1+R2 ${diffToParStr(diff)}` : '<span class="text-gray-400">—</span>';
        const status = missed
          ? '<span class="text-gray-500">did not make cut</span>'
          : '<span class="text-gray-500">made cut</span>';
        const cls = isWin ? 'text-green-700 font-semibold' : 'text-gray-700';
        html += `<tr><td></td><td colspan="${betLabels.length}" class="text-sm ${cls}">${user} — ${stripOdds(golfer)} · ${r1r2} · ${status}</td></tr>`;
      }
      // Outcome / payout summary
      let mcSummary;
      if (!mcBet.resolved) mcSummary = '<span class="text-gray-400 italic">pending — cut not yet made</span>';
      else if (mcBet.type === 'no_winner') mcSummary = '<span class="text-gray-500">No winner — no pick missed the cut</span>';
      else if (mcBet.type === 'three_way_tie') mcSummary = '<span class="text-gray-500">All picks missed — no payout</span>';
      else if (mcBet.type === 'winner') mcSummary = `<span class="text-green-700 font-semibold">${mcBet.winner} wins ${mcBet.payout}</span>`;
      else if (mcBet.type === 'two_way_tie') mcSummary = `<span class="text-green-700 font-semibold">${mcBet.winners.join(' & ')} — ${mcBet.payout}</span>`;
      html += `<tr><td></td><td colspan="${betLabels.length}" class="text-sm">${mcSummary}</td></tr>`;
    }

    html += `</tbody></table></div></div>`;
  }

  // Group by owner for display
  const users = await api('GET', '/users');

  // Money summary
  if (hasBets) {
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
  }

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
            ${(() => {
              const p = tournament?.par || 72;
              // Per-golfer day diffs + 4-day total. Days 1/2 total cells sum all golfers;
              // Days 3/4 use best-2 single-day diffs, and the grand total uses best-2 of
              // 4-day cumulative diffs — matching the bet conditions for rounds 3, 4 and overall.
              const perGolfer = golfers.map((g) => {
                const s = scores[g] || {};
                const dayScores = [s.day1, s.day2, s.day3, s.day4];
                const dayThrus = [s.day1Thru, s.day2Thru, s.day3Thru, s.day4Thru];
                const dayRels = [s.day1Rel, s.day2Rel, s.day3Rel, s.day4Rel];
                const dayDiffs = [];
                const dayHas = [];
                for (let d = 0; d < 4; d++) {
                  const { diff, count } = sumAllRelative([dayScores[d]], [dayThrus[d]], [dayRels[d]], p);
                  dayDiffs.push(count ? diff : null);
                  dayHas.push(count > 0);
                }
                const missedCut = didMissCut(s, p, cutLine);
                const { diff: totalDiff, count: totalCount } = sumAllRelative(dayScores, dayThrus, dayRels, p);
                return { g, s, dayScores, dayThrus, dayRels, dayDiffs, dayHas, totalDiff, totalCount, missedCut };
              });

              const rows = perGolfer.map(({ g, dayScores, dayThrus, dayRels, totalDiff, totalCount, missedCut }) => {
                return `<tr>
                  <td class="font-medium">
                    ${g}
                    ${wcSet.has(g) ? `<span class="badge badge-wc ml-1">WC</span>` : ''}
                  </td>
                  ${dayScores.map((v, idx) => {
                    const isR34MissedCut = missedCut && (idx === 2 || idx === 3);
                    const tdCls = '';
                    return `<td${tdCls}>${dayCell(v, p, dayThrus[idx], dayRels[idx], isR34MissedCut)}</td>`;
                  }).join('')}
                  <td class="font-semibold">${totalCount ? diffToParStr(totalDiff) : '<span class="text-gray-300">—</span>'}</td>
                </tr>`;
              });

              // Day 1/2: sum across all golfers. Day 3/4: best 2 single-day diffs.
              const bestTwoNote = '<div class="text-[10px] font-normal text-gray-400 leading-tight">*best two</div>';
              const allScoresNote = '<div class="text-[10px] font-normal text-gray-400 leading-tight">*all scores</div>';
              const dayTotalCells = [];
              for (let d = 0; d < 4; d++) {
                const note = d < 2 ? allScoresNote : bestTwoNote;
                const valid = perGolfer.filter((gr) => gr.dayHas[d]).map((gr) => gr.dayDiffs[d]);
                if (valid.length === 0) {
                  dayTotalCells.push(`${note}<span class="text-gray-300">—</span>`);
                  continue;
                }
                if (d < 2) {
                  const sum = valid.reduce((a, b) => a + b, 0);
                  dayTotalCells.push(`${note}${diffToParStr(sum)}`);
                } else {
                  if (valid.length < 2) {
                    dayTotalCells.push(`${note}<span class="text-gray-300">—</span>`);
                  } else {
                    const sorted = [...valid].sort((a, b) => a - b);
                    dayTotalCells.push(`${note}${diffToParStr(sorted[0] + sorted[1])}`);
                  }
                }
              }

              // Grand total: best 2 of 4-day cumulative diffs. Restrict to golfers tied
              // for the max rounds-played on this team so CUT/WD golfers don't poison
              // the pick with a partial-round diff that looks artificially low.
              const maxTotalCount = Math.max(0, ...perGolfer.map((gr) => gr.totalCount));
              const eligibleTotals = perGolfer
                .filter((gr) => gr.totalCount > 0 && gr.totalCount === maxTotalCount)
                .map((gr) => gr.totalDiff)
                .sort((a, b) => a - b);
              let grandCell;
              if (eligibleTotals.length === 0) {
                grandCell = '<span class="text-gray-300">—</span>';
              } else if (eligibleTotals.length < 2) {
                grandCell = diffToParStr(eligibleTotals[0]);
              } else {
                grandCell = diffToParStr(eligibleTotals[0] + eligibleTotals[1]);
              }
              grandCell = `${bestTwoNote}${grandCell}`;

              rows.push(`<tr class="border-t border-gray-200 font-semibold">
                <td>Total</td>
                ${dayTotalCells.map((c) => `<td>${c}</td>`).join('')}
                <td>${grandCell}</td>
              </tr>`);
              // WC golfer row (not included in totals)
              const wcGolfer = wcData[user];
              if (wcGolfer) {
                const ws = scores[wcGolfer] || {};
                const wDayScores = [ws.day1, ws.day2, ws.day3, ws.day4];
                const wDayThrus = [ws.day1Thru, ws.day2Thru, ws.day3Thru, ws.day4Thru];
                const wDayRels = [ws.day1Rel, ws.day2Rel, ws.day3Rel, ws.day4Rel];
                const { diff: wDiff, count: wCount } = sumAllRelative(wDayScores, wDayThrus, wDayRels, p);
                rows.push(`<tr class="border-t border-dashed border-gray-200">
                  <td class="font-medium text-amber-700">🎰 ${stripOdds(wcGolfer)} <span class="badge badge-wc ml-1">WC</span></td>
                  ${wDayScores.map((v, idx) => `<td>${dayCell(v, p, wDayThrus[idx], wDayRels[idx])}</td>`).join('')}
                  <td class="font-semibold">${wCount ? diffToParStr(wDiff) : '<span class="text-gray-300">—</span>'}</td>
                </tr>`);
              }
              // Missed-cut pick row — show day-by-day scores so the cut is visible,
              // with the cut-relevant R1+R2 to-par in the total column.
              const mcGolfer = mcData[user];
              if (mcGolfer) {
                const ms = scores[mcGolfer] || {};
                const mDayScores = [ms.day1, ms.day2, ms.day3, ms.day4];
                const mDayThrus = [ms.day1Thru, ms.day2Thru, ms.day3Thru, ms.day4Thru];
                const mDayRels = [ms.day1Rel, ms.day2Rel, ms.day3Rel, ms.day4Rel];
                const mMissed = didMissCut(ms, p, cutLine);
                const { diff: mDiff, count: mCount } = sumAllRelative([ms.day1, ms.day2], [ms.day1Thru, ms.day2Thru], [ms.day1Rel, ms.day2Rel], p);
                rows.push(`<tr class="border-t border-dashed border-gray-200">
                  <td class="font-medium text-purple-700">🎲 ${stripOdds(mcGolfer)} <span class="badge ml-1" style="background:#ede9fe;color:#6d28d9">MC</span></td>
                  ${mDayScores.map((v, idx) => {
                    const isR34MissedCut = mMissed && (idx === 2 || idx === 3);
                    const tdCls = '';
                    return `<td${tdCls}>${dayCell(v, p, mDayThrus[idx], mDayRels[idx], isR34MissedCut)}</td>`;
                  }).join('')}
                  <td class="font-semibold" title="R1+R2 to par">${mCount ? `R1+R2 ${diffToParStr(mDiff)}` : '<span class="text-gray-300">—</span>'}</td>
                </tr>`);
              }
              return rows.join('');
            })()}
          </tbody>
        </table>
      </div>
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
            ${(() => {
              const p = tournament?.par || 72;
              const dayTotals = [0, 0, 0, 0];
              const dayCounts = [0, 0, 0, 0];
              const rows = scored.map((g) => {
                const s = scores[g] || {};
                const dayScores = [s.day1, s.day2, s.day3, s.day4];
                const dayThrus = [s.day1Thru, s.day2Thru, s.day3Thru, s.day4Thru];
                const dayRels = [s.day1Rel, s.day2Rel, s.day3Rel, s.day4Rel];
                for (let d = 0; d < 4; d++) {
                  const { diff, count } = sumAllRelative([dayScores[d]], [dayThrus[d]], [dayRels[d]], p);
                  if (count) { dayTotals[d] += diff; dayCounts[d] += count; }
                }
                const missedCut = didMissCut(s, p, cutLine);
                const { diff, count } = sumAllRelative(dayScores, dayThrus, dayRels, p);
                return `<tr>
                  <td>${g}${wcSet.has(g) ? ' <span class="badge badge-wc">WC</span>' : ''}</td>
                  ${dayScores.map((v, idx) => {
                    const isR34MissedCut = missedCut && (idx === 2 || idx === 3);
                    const tdCls = '';
                    return `<td${tdCls}>${dayCell(v, p, dayThrus[idx], dayRels[idx], isR34MissedCut)}</td>`;
                  }).join('')}
                  <td class="font-semibold">${count ? diffToParStr(diff) : '—'}</td>
                </tr>`;
              });
              const totalDiff = dayTotals.reduce((a, b) => a + b, 0);
              const totalCount = dayCounts.reduce((a, b) => a + b, 0);
              rows.push(`<tr class="border-t border-gray-200 font-semibold">
                <td>Total</td>
                ${dayTotals.map((t, i) => `<td>${dayCounts[i] ? diffToParStr(t) : '<span class="text-gray-300">—</span>'}</td>`).join('')}
                <td>${totalCount ? diffToParStr(totalDiff) : '<span class="text-gray-300">—</span>'}</td>
              </tr>`);
              return rows.join('');
            })()}
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
    navigate('bets');
  });

  socket.on('wc:picked', async ({ player }) => {
    showToast(`${player} picked their Wild Card`, 'info');
    if (state.view === 'bets') navigate('bets');
  });

  socket.on('mc:picked', async ({ player }) => {
    showToast(`${player} made their missed cut pick`, 'info');
    if (state.view === 'bets') navigate('bets');
  });

  socket.on('tournament:advanced', async ({ status }) => {
    state.tournament = await api('GET', '/tournament');
    if (status === 'mc_pick') {
      showToast('Wild Card picks done! Now pick your Missed Cut golfer.', 'success');
      navigate('bets');
    } else if (status === 'day1') {
      showToast('All picks locked in! Tournament is live.', 'success');
      navigate('scoreboard');
    } else {
      showToast(`Tournament advanced to ${status}`, 'info');
      if (['scoreboard', 'admin'].includes(state.view)) navigate(state.view);
    }
  });

  socket.on('scores:updated', () => {
    if (state.view === 'scoreboard') navigate(state.view);
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
      state.role = session.role || 'user';
      state.tournament = await api('GET', '/tournament');
      document.title = state.tournament?.name || 'Golf Betting';
      setupSocket();
      const allViews = ['admin', 'bets', 'draft', 'scoreboard'];
      const hashView = location.hash.slice(1);
      const defaultView = state.role === 'patron' ? 'scoreboard' : routeFromStatus(state.tournament?.status);
      navigate(allViews.includes(hashView) ? hashView : defaultView);
    } else {
      navigate('login');
    }
  } catch {
    navigate('login');
  }
}

init();
