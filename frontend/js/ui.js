// ─────────────────────────────────────────────────────────────
//  ui.js  —  Shared UI helpers
// ─────────────────────────────────────────────────────────────

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

function parseChips(s) {
  if (!s) return null;
  s = s.toString().trim().toLowerCase();
  const sfx = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  const last = s.slice(-1);
  try {
    const v = sfx[last] ? parseFloat(s.slice(0,-1)) * sfx[last] : parseFloat(s);
    return isFinite(v) && v >= 0 ? v : null;
  } catch { return null; }
}

function fmt(n)    { return fmtC(n); }
function fmtD(n)   { return "$" + fmtC(n); }
function esc(s)    { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className   = "toast show " + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = "toast", 2800);
}

// ── Balance display ───────────────────────────────────────────
function refreshBalance() {
  const u = sessionGet();
  if (!u) return;
  document.querySelectorAll(".js-balance").forEach(el => el.textContent = fmtC(u.balance));
  _refreshGdice();
}

function _refreshGdice() {
  const u = sessionGet();
  const g = u ? parseFloat(u.gdice || 0) : 0;
  document.querySelectorAll(".js-gdice-wrap").forEach(el => {
    el.style.display = g > 0 ? "flex" : "none";
  });
  document.querySelectorAll(".js-gdice").forEach(el => el.textContent = fmtC(g));
}

// ── fillShell ─────────────────────────────────────────────────
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

// ── Bet helpers ───────────────────────────────────────────────
function half(id) {
  const el = document.getElementById(id);
  el.value = fmtC(Math.max(1, (parseChips(el.value) || 0) / 2));
}
function dbl(id) {
  const u  = sessionGet();
  const el = document.getElementById(id);
  const total = (parseFloat(u.balance)||0) + (parseFloat(u.gdice)||0);
  el.value = fmtC(Math.min((parseChips(el.value) || 0) * 2, total));
}
function mx(id) {
  const u = sessionGet();
  const total = (parseFloat(u.balance)||0) + (parseFloat(u.gdice)||0);
  document.getElementById(id).value = fmtC(total);
}

function getBet(id) {
  return Math.max(0, parseChips(document.getElementById(id).value) || 0);
}
function checkBet(id) {
  const u = sessionGet();
  if (!u) { toast("Not logged in.", "lose"); return false; }
  const bet   = getBet(id);
  const total = (parseFloat(u.balance) || 0) + (parseFloat(u.gdice) || 0);
  if (bet <= 0)    { toast("Enter a valid bet amount.", "info"); return false; }
  if (bet > total) { toast("Not enough chips!", "lose");         return false; }
  return true;
}

// ── Golden dice split (read-only — does NOT deduct) ───────────
// Call this BEFORE finishBet to know how much came from gdice vs chips.
function splitBet(betAmount) {
  const u          = sessionGet();
  const gdice      = u ? parseFloat(u.gdice || 0) : 0;
  const gdiceSpent = Math.min(gdice, betAmount);
  const chipsSpent = Math.max(0, betAmount - gdiceSpent);
  return { gdiceSpent, chipsSpent };
}

// ── Result box ────────────────────────────────────────────────
function showResult(boxId, win, icon, title, sub) {
  const el = document.getElementById(boxId);
  el.className = "result-box show " + (win ? "win" : "lose");
  el.innerHTML = `
    <div class="result-icon">${icon}</div>
    <div class="result-title ${win?"win":"lose"}">${title}</div>
    <div class="result-sub">${sub}</div>`;
}

// ── finishBet ─────────────────────────────────────────────────
// THE ONLY function that writes balance to DB.
// Games must NOT pre-deduct the session. Just call finishBet with
// the split, and it handles everything: DB write + session sync.
async function finishBet(game, bet, multiplier, payout, win, gdiceSpent = 0, chipsSpent = null) {
  if (chipsSpent === null) chipsSpent = bet - gdiceSpent;

  // Clamp to valid numbers
  gdiceSpent = Math.max(0, parseFloat(gdiceSpent) || 0);
  chipsSpent = Math.max(0, parseFloat(chipsSpent) || 0);
  payout     = Math.max(0, parseFloat(payout)     || 0);

  const u = sessionGet();
  if (!u) return 0;

  // Optimistic UI so the page feels instant
  const curBal   = parseFloat(u.balance)     || 0;
  const curGdice = parseFloat(u.gdice || 0)  || 0;
  const optBal   = parseFloat(Math.max(0, win
    ? curBal - chipsSpent + payout
    : curBal - chipsSpent
  ).toFixed(4));
  const optGdice = parseFloat(Math.max(0, curGdice - gdiceSpent).toFixed(4));
  sessionSetBoth(optBal, optGdice);
  refreshBalance();

  try {
    const result = await dbSaveBet(
      u.discord_id, u.username,
      game, bet, multiplier, payout, win,
      gdiceSpent, chipsSpent
    );
    // Always correct with the authoritative DB value
    if (result && typeof result.balance === "number" && !isNaN(result.balance)) {
      sessionSetBoth(result.balance, result.gdice);
      refreshBalance();
      return result.balance;
    }
    return optBal;
  } catch (e) {
    console.warn("finishBet DB error:", e.message);
    // Roll back the optimistic update so the balance isn't wrong
    sessionSetBoth(curBal, curGdice);
    refreshBalance();
    toast("Bet save failed — balance restored.", "lose");
    return curBal;
  }
}
