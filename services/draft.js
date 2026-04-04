export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildPickOrder(draftOrder) {
  // Snake draft: [P1,P2,P3, P3,P2,P1, P1,P2,P3, ...] for 6 rounds
  const picks = [];
  for (let round = 0; round < 6; round++) {
    const order = round % 2 === 0 ? [...draftOrder] : [...draftOrder].reverse();
    picks.push(...order);
  }
  return picks;
}

export function getCurrentPlayer(pickOrder, currentPickIndex) {
  return pickOrder[currentPickIndex];
}

export function buildTeams(picks, users) {
  const teams = {};
  users.forEach((u) => (teams[u] = []));
  picks.forEach((p) => teams[p.player].push(p.golfer));
  return teams;
}
