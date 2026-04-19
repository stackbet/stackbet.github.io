// ─────────────────────────────────────────────────────────────
//  crash.js
// ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => { await fillShell(); startRound(); });

let cg = { phase:"waiting", multi:1, crashAt:1, bet:0, betPlaced:false, cashedOut:false, iv:null, bots:[] };

const BOT_NAMES = [".shark","LuckyAce","Grinder","NightOwl","RiskyBiz","Whales","HighRoller"];

function genCrashPoint() {
  const r = Math.random();
  return r < 0.04 ? 1.00 : parseFloat((1/(1-r)*0.96).toFixed(2));
}

function genBots() {
  const n = Math.floor(Math.random()*4)+2;
  cg.bots = Array.from({length:n}, () => ({
    name:  BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)],
    bet:   Math.floor(Math.random()*200)+10,
    outAt: parseFloat((Math.random()*3+1.2).toFixed(2)),
    state: "active"
  }));
}

function renderPlayers() {
  const el = document.getElementById("crashPlayers");
  const rows = [];
  const u = sessionGet();
  if (cg.betPlaced) {
    if      (cg.cashedOut)               rows.push(`<div class="cp-row cashed">${esc(u.username)} · cashed ${fmt(cg.multi)}×</div>`);
    else if (cg.phase==="crashed")       rows.push(`<div class="cp-row busted">${esc(u.username)} · busted 💸</div>`);
    else                                 rows.push(`<div class="cp-row active">${esc(u.username)} · $${fmt(cg.bet)}</div>`);
  }
  cg.bots.forEach(b => {
    if      (b.state==="cashed") rows.push(`<div class="cp-row cashed">${b.name} · cashed ${b.outAt}×</div>`);
    else if (b.state==="busted") rows.push(`<div class="cp-row busted">${b.name} · busted 💸</div>`);
    else                         rows.push(`<div class="cp-row active">${b.name} · $${b.bet}</div>`);
  });
  el.innerHTML = rows.join("") || `<p class="empty">No players.</p>`;
}

function startRound() {
  cg = { phase:"waiting", multi:1, crashAt:genCrashPoint(), bet:0, betPlaced:false, cashedOut:false, iv:null, bots:[] };
  genBots();

  document.getElementById("crashMulti").className    = "crash-multi waiting";
  document.getElementById("crashMulti").textContent  = "WAITING...";
  document.getElementById("crashStatus").textContent = "Place bets now!";
  document.getElementById("betBtn").classList.remove("hidden");
  document.getElementById("betBtn").disabled = false;
  document.getElementById("cashBtn").classList.add("hidden");
  renderPlayers();

  setTimeout(runRound, 4000);
}

function runRound() {
  cg.phase = "running";
  document.getElementById("crashMulti").className   = "crash-multi live";
  document.getElementById("crashStatus").textContent = "LIVE";
  document.getElementById("betBtn").classList.add("hidden");

  const t0 = Date.now();
  cg.iv = setInterval(() => {
    cg.multi = parseFloat(Math.pow(Math.E, 0.08*(Date.now()-t0)/1000).toFixed(2));
    document.getElementById("crashMulti").textContent = cg.multi.toFixed(2) + "×";

    if (cg.betPlaced && !cg.cashedOut) {
      document.getElementById("cashBtn").classList.remove("hidden");
      document.getElementById("cashMultiLabel").textContent = cg.multi.toFixed(2);
    }

    cg.bots.forEach(b => { if (b.state==="active" && cg.multi >= b.outAt) { b.state="cashed"; renderPlayers(); } });

    if (cg.multi >= cg.crashAt) { clearInterval(cg.iv); doCrash(); }
  }, 100);
}

function doCrash() {
  cg.phase = "crashed";
  document.getElementById("crashMulti").className   = "crash-multi crashed";
  document.getElementById("crashMulti").textContent = "CRASHED @ " + cg.crashAt + "×";
  document.getElementById("crashStatus").textContent = "Crashed!";
  document.getElementById("cashBtn").classList.add("hidden");
  cg.bots.forEach(b => { if (b.state==="active") b.state="busted"; });

  if (cg.betPlaced && !cg.cashedOut) {
    finishBet("Crash", cg.bet, cg.crashAt, 0, false);
    toast(`Crashed @ ${cg.crashAt}× · Lost ${fmtD(cg.bet)}`, "lose");
  }
  renderPlayers();
  setTimeout(startRound, 4000);
}

function placeBet() {
  if (cg.phase !== "waiting") { toast("Wait for next round!", "info"); return; }
  if (!checkBet("crashBet")) return;
  cg.bet = getBet("crashBet");
  cg.betPlaced = true;
  const u = sessionGet();
  sessionSetBalance(parseFloat((u.balance - cg.bet).toFixed(2)));
  refreshBalance();
  document.getElementById("betBtn").disabled = true;
  toast(`Bet placed: ${fmtD(cg.bet)}`, "info");
  renderPlayers();
}

function doCashout() {
  if (!cg.betPlaced || cg.cashedOut || cg.phase !== "running") return;
  cg.cashedOut = true;
  const payout = parseFloat((cg.bet * cg.multi).toFixed(2));
  document.getElementById("cashBtn").classList.add("hidden");
  const u = sessionGet();
  sessionSetBalance(parseFloat((u.balance + payout).toFixed(2)));
  refreshBalance();
  finishBet("Crash", cg.bet, cg.multi, payout, true);
  toast(`Cashed out ${cg.multi.toFixed(2)}× · +${fmtD(payout - cg.bet)}`, "win");
  renderPlayers();
}
