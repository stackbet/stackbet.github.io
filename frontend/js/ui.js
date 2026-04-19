// ─────────────────────────────────────────────────────────────
//  ui.js  —  Shared UI helpers
// ─────────────────────────────────────────────────────────────

// ── Chip abbreviation formatter (K / M / B / T) ──────────────
function fmtC(n) {
  n = parseFloat(n);
  if (isNaN(n)) return "0";
  const a = Math.abs(n);
  if (a >= 1e12) return (n/1e12).toFixed(2).replace(/\.?0+$/, "") + "T";
  if (a >= 1e9)  return (n/1e9) .toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6)  return (n/1e6) .toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e3)  return (n/1e3) .toFixed(2).replace(/\.?0+$/, "") + "K";
  return n % 1 === 0 ? String(Math.floor(n)) : n.toFixed(2);
}

// Parse "1k", "2.5M", "100", "3B" etc. → number (null on failure)
function parseChips(s) {
  if (!s) return null;
  s = s.toString().trim().toLowerCase();
  const sfx = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  const last = s.slice(-1);
  try {
    const v = sfx[last] ? parseFloat(s.slice(0, -1)) * sfx[last] : parseFloat(s);
    return isFinite(v) && v >= 0 ? v : null;
  } catch { return null; }
}

// Legacy aliases (used by game pages)
function fmt(n)  { return fmtC(n); }
function fmtD(n) { return "$" + fmtC(n); }
function esc(s)  { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Toast notification ────────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className   = "toast show " + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = "toast", 2800);
}

// ── Update balance display everywhere on the page ─────────────
function refreshBalance() {
  const u = sessionGet();
  if (!u) return;
  document.querySelectorAll(".js-balance").forEach(el => {
    el.textContent = fmtC(u.balance);
  });
}

// ── Fill sidebar user info ─────────────────────────────────────
async function fillShell() {
  const u = await requireLoginAsync();
  if (!u) return null;

  document.querySelectorAll(".js-username").forEach(el => el.textContent = u.username);

  const initials = u.username.slice(0, 2).toUpperCase();
  document.querySelectorAll(".js-avatar").forEach(el => {
    if (u.avatar) {
      el.innerHTML = `<img src="${u.avatar}" alt="" onerror="this.parentElement.textContent='${initials}'">`;
    } else {
      el.textContent = initials;
    }
  });

  refreshBalance();

  if (typeof adminInit === "function") adminInit();

  return u;
}

// ── Quick-bet buttons (support abbreviations in input fields) ──
function half(id) {
  const el  = document.getElementById(id);
  const cur = parseChips(el.value) || 0;
  el.value  = fmtC(Math.max(1, cur / 2));
}
function dbl(id) {
  const u   = sessionGet();
  const el  = document.getElementById(id);
  const cur = parseChips(el.value) || 0;
  el.value  = fmtC(Math.min(cur * 2, u.balance));
}
function mx(id) {
  const u  = sessionGet();
  document.getElementById(id).value = fmtC(u.balance);
}

// ── Get bet from input (parses abbreviations) ─────────────────
function getBet(id) {
  const raw = document.getElementById(id).value;
  return Math.max(0, parseChips(raw) || 0);
}
function checkBet(id) {
  const u   = sessionGet();
  const bet = getBet(id);
  if (bet <= 0)        { toast("Enter a valid bet amount.", "info"); return false; }
  if (bet > u.balance) { toast("Not enough chips!",         "lose"); return false; }
  return true;
}

// ── Show win/lose result box ──────────────────────────────────
function showResult(boxId, win, icon, title, sub) {
  const el = document.getElementById(boxId);
  el.className = "result-box show " + (win ? "win" : "lose");
  el.innerHTML = `
    <div class="result-icon">${icon}</div>
    <div class="result-title ${win?"win":"lose"}">${title}</div>
    <div class="result-sub">${sub}</div>`;
}

// ── After a game: save to DB and refresh balance ──────────────
async function finishBet(game, bet, multiplier, payout, win) {
  const u = sessionGet();
  try {
    const newBal = await dbSaveBet(
      u.discord_id, u.username,
      game, bet, multiplier, payout, win
    );
    sessionSetBalance(newBal);
    refreshBalance();
    return newBal;
  } catch (e) {
    const local = win
      ? parseFloat((u.balance + payout - bet).toFixed(4))
      : parseFloat((u.balance - bet).toFixed(4));
    sessionSetBalance(Math.max(0, local));
    refreshBalance();
    return Math.max(0, local);
  }
}
