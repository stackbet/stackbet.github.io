// ─────────────────────────────────────────────────────────────
//  utils.js  –  Shared helpers used on every game page
// ─────────────────────────────────────────────────────────────

function fmt(n)        { return parseFloat(n).toFixed(2); }
function fmtD(n)       { return '$' + fmt(n); }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function esc(s)        { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Quick-bet buttons ──────────────────────────────────────
function half(id) {
  const el = document.getElementById(id);
  el.value = fmt(Math.max(1, parseFloat(el.value || 0) / 2));
}
function dbl(id) {
  const user = getUser();
  const el   = document.getElementById(id);
  el.value   = fmt(Math.min(parseFloat(el.value || 0) * 2, user.balance));
}
function mx(id) {
  const user = getUser();
  document.getElementById(id).value = fmt(user.balance);
}

// ── Validate bet before playing ───────────────────────────
function getBet(id) {
  return Math.max(0, parseFloat(document.getElementById(id).value) || 0);
}
function checkBet(id) {
  const user = getUser();
  const bet  = getBet(id);
  if (bet <= 0)            { toast('Enter a valid bet amount.', 'info'); return false; }
  if (bet > user.balance)  { toast('Not enough chips!', 'lose');         return false; }
  return true;
}

// ── After a game resolves: save result + refresh balance ──
async function finishBet(game, bet, multiplier, payout, win) {
  const user = getUser();
  try {
    const res = await apiSaveBet(user.userId, { game, bet, multiplier, payout, win });
    updateBalance(res.newBalance);
    refreshBalanceUI();
  } catch (e) {
    // If server is unreachable just update locally
    updateBalance(user.balance + (win ? payout - bet : -bet));
    refreshBalanceUI();
  }
}

// ── Show result box ────────────────────────────────────────
function showResult(elId, win, iconHtml, title, sub) {
  const el = document.getElementById(elId);
  el.className = 'result-box show ' + (win ? 'win' : 'lose');
  el.innerHTML = `
    <div class="result-icon">${iconHtml}</div>
    <div class="result-title ${win?'win':'lose'}">${title}</div>
    <div class="result-sub">${sub}</div>`;
}
