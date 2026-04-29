document.addEventListener("DOMContentLoaded", async () => { await fillShell(); startRound(); });

let cg = { phase:"waiting", multi:1, crashAt:1, bet:0, betPlaced:false, cashedOut:false,
           iv:null, bots:[], gdiceSpent:0, chipsSpent:0 };

const BOT_NAMES = [".shark","LuckyAce","Grinder","NightOwl","RiskyBiz","Whales","HighRoller","Moon2x","SafePlay","DegenApe"];

// ── Crash point generation ────────────────────────────────────
// RTP = 97%. Distribution is psychologically tuned:
//   ~35% of rounds crash between 1.00–1.50
//   ~30% crash between 1.50–2.00 (peaks at 1.80–1.97, the "2x trap")
//   ~35% reach 2.00+
//
// The standard provably-fair formula gives P(survive to x) = RTP/x.
// We blend it with a concentrated low-range distribution to create
// the psychological effect of "so close to 2x" without destroying RTP.
function genCrashPoint() {
  const r = Math.random();

  // 3% instant crash at 1.00
  if (r < 0.03) return 1.00;

  // 60% of rounds: use a skewed distribution concentrated below 2.10
  // with a strong peak in the 1.75–1.99 range
  if (r < 0.63) {
    // Use two uniform samples averaged (triangle distribution 0–1, peak 0.5)
    // then remap to 1.10–2.10 with right-skew so peak lands ~1.87
    const u = (Math.random() + Math.random()) / 2; // triangle 0–1, peak 0.5
    const skewed = Math.pow(u, 0.65); // shift peak rightward toward 0.7
    return parseFloat((1.10 + skewed * 1.00).toFixed(2)); // range 1.10–2.10
  }

  // 37% of rounds: standard formula with 97% RTP (fat tail, can go very high)
  // P(crash >= x) = 0.97 / x
  const adjusted = (r - 0.63) / 0.37; // renormalize to 0–1
  const raw = 0.97 / (1 - adjusted);
  return parseFloat(Math.max(1.01, Math.min(raw, 1000)).toFixed(2));
}

function genBots() {
  const n = Math.floor(Math.random()*5)+2;
  cg.bots = Array.from({length:n}, () => {
    // Bots mostly target realistic cashout points (1.2×–3×), a few moonshots
    const moonshot = Math.random() < 0.15;
    const outAt = moonshot
      ? parseFloat((3 + Math.random()*7).toFixed(2))
      : parseFloat((1.2 + Math.random()*1.8).toFixed(2));
    return {
      name:  BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)],
      bet:   Math.floor(Math.random()*300)+10,
      outAt,
      state: "active"
    };
  });
}

function renderPlayers() {
  const el = document.getElementById("crashPlayers");
  const u  = sessionGet();
  const rows = [];
  if (cg.betPlaced) {
    if      (cg.cashedOut)         rows.push(`<div class="cp-row cashed">${esc(u.username)} · cashed ${cg.multi.toFixed(2)}×</div>`);
    else if (cg.phase==="crashed") rows.push(`<div class="cp-row busted">${esc(u.username)} · busted 💸</div>`);
    else                           rows.push(`<div class="cp-row active">${esc(u.username)} · $${fmtC(cg.bet)}</div>`);
  }
  cg.bots.forEach(b => {
    if      (b.state==="cashed") rows.push(`<div class="cp-row cashed">${b.name} · cashed ${b.outAt}×</div>`);
    else if (b.state==="busted") rows.push(`<div class="cp-row busted">${b.name} · busted 💸</div>`);
    else                         rows.push(`<div class="cp-row active">${b.name} · $${b.bet}</div>`);
  });
  el.innerHTML = rows.join("") || `<p class="empty">No players.</p>`;
}

function startRound() {
  cg = { phase:"waiting", multi:1, crashAt:genCrashPoint(), bet:0, betPlaced:false,
         cashedOut:false, iv:null, bots:[], gdiceSpent:0, chipsSpent:0 };
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
  document.getElementById("crashMulti").className    = "crash-multi live";
  document.getElementById("crashStatus").textContent = "LIVE";
  document.getElementById("betBtn").classList.add("hidden");
  const t0 = Date.now();
  cg.iv = setInterval(() => {
    const elapsed = (Date.now()-t0)/1000;
    // Exponential growth: slower at first, then accelerates
    cg.multi = parseFloat(Math.pow(Math.E, 0.07*elapsed).toFixed(2));
    document.getElementById("crashMulti").textContent = cg.multi.toFixed(2)+"×";
    if (cg.betPlaced && !cg.cashedOut) {
      document.getElementById("cashBtn").classList.remove("hidden");
      document.getElementById("cashMultiLabel").textContent = cg.multi.toFixed(2);
    }
    cg.bots.forEach(b => { if (b.state==="active"&&cg.multi>=b.outAt){ b.state="cashed"; renderPlayers(); } });
    if (cg.multi >= cg.crashAt) { clearInterval(cg.iv); doCrash(); }
  }, 100);
}

function doCrash() {
  cg.phase = "crashed";
  document.getElementById("crashMulti").className    = "crash-multi crashed";
  document.getElementById("crashMulti").textContent  = "CRASHED @ "+cg.crashAt+"×";
  document.getElementById("crashStatus").textContent = "Crashed!";
  document.getElementById("cashBtn").classList.add("hidden");
  cg.bots.forEach(b => { if (b.state==="active") b.state="busted"; });
  if (cg.betPlaced && !cg.cashedOut) {
    finishBet("Crash", cg.bet, 0, 0, false, cg.gdiceSpent, cg.chipsSpent);
    toast(`Crashed @ ${cg.crashAt}× · Lost ${fmtD(cg.bet)}`, "lose");
  }
  renderPlayers();
  setTimeout(startRound, 4000);
}

function placeBet() {
  if (cg.phase !== "waiting") { toast("Wait for next round!","info"); return; }
  if (!checkBet("crashBet")) return;
  const bet = getBet("crashBet");
  const { gdiceSpent, chipsSpent } = splitBet(bet);
  cg.bet        = bet;
  cg.gdiceSpent = gdiceSpent;
  cg.chipsSpent = chipsSpent;
  cg.betPlaced  = true;
  document.getElementById("betBtn").disabled = true;
  toast(`Bet placed: ${fmtD(bet)}`, "info");
  renderPlayers();
}

function doCashout() {
  if (!cg.betPlaced||cg.cashedOut||cg.phase!=="running") return;
  cg.cashedOut = true;
  const payout = parseFloat((cg.bet*cg.multi).toFixed(4));
  document.getElementById("cashBtn").classList.add("hidden");
  finishBet("Crash", cg.bet, cg.multi, payout, true, cg.gdiceSpent, cg.chipsSpent);
  toast(`Cashed out ${cg.multi.toFixed(2)}× · +${fmtD(payout-cg.bet)}`, "win");
  renderPlayers();
}

