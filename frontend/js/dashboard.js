// ─────────────────────────────────────────────────────────────
//  dashboard.js
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const u = await fillShell();
  if (!u) return;

  document.getElementById("welcomeName").textContent = u.username;
  document.getElementById("welcomeBal").textContent  = fmt(u.balance);

  // Load leaderboard
  try {
    const players = await dbLeaderboard();
    renderLB(players);
  } catch { document.getElementById("leaderboard").innerHTML = '<p class="empty">Could not load.</p>'; }

  // Load feed
  try {
    const bets = await dbFeed();
    renderFeed(bets);
  } catch { /* leave placeholder */ }
});

function renderLB(players) {
  const el = document.getElementById("leaderboard");
  if (!players.length) { el.innerHTML = '<p class="empty">No players yet.</p>'; return; }
  const cls = ["r1","r2","r3"];
  el.innerHTML = players.slice(0,5).map((p,i) => `
    <div class="lb-row">
      <div class="lb-rank ${cls[i]||'rn'}">${i+1}</div>
      <div class="lb-av">${esc(p.username.slice(0,2).toUpperCase())}</div>
      <div class="lb-name">${esc(p.username)}</div>
      <div class="lb-bal">${fmtD(p.balance)}</div>
    </div>`).join("");
}

function renderFeed(bets) {
  const el = document.getElementById("liveFeed");
  // Only show wins
  const wins = bets.filter(b => b.win);
  if (!wins.length) { el.innerHTML = '<p class="empty">No wins yet — be the first!</p>'; return; }
  el.innerHTML = wins.slice(0, 10).map(b => `
    <div class="feed-row">
      <div class="feed-av">${esc(b.username.slice(0,2).toUpperCase())}</div>
      <div class="feed-info">
        <span class="feed-name">${esc(b.username)}</span>
        <span class="feed-game">${esc(b.game)}</span>
      </div>
      <div class="feed-right">
        <span class="feed-bet">${fmtD(b.bet)} · ${fmt(b.multiplier)}×</span>
        <span class="feed-pay">+${fmtD(b.payout)}</span>
      </div>
    </div>`).join("");
}
