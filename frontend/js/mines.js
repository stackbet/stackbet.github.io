document.addEventListener("DOMContentLoaded", async () => { await fillShell(); buildGrid(); });

let mg = { active:false, bombs:[], revealed:[], bet:0, gems:0, mineCount:3, gdiceSpent:0, chipsSpent:0 };
let mCashingOut = false; // prevent double cashout

function calcMulti(mines, gems) {
  let prob = 1;
  for (let i=0; i<gems; i++) prob *= (25-mines-i)/(25-i);
  return parseFloat(Math.max(1.01, 0.97/prob).toFixed(2));
}

function buildGrid() {
  const grid = document.getElementById("mGrid");
  grid.innerHTML = "";
  for (let i=0; i<25; i++) {
    const c = document.createElement("div");
    c.className="m-cell"; c.textContent="⬜"; c.dataset.i=i;
    c.onclick=()=>reveal(i);
    grid.appendChild(c);
  }
  document.getElementById("mGems").textContent   = "0";
  document.getElementById("mMulti").textContent  = "1.00×";
  document.getElementById("mProfit").textContent = "$0.00";
}

function startMines() {
  if (mg.active) return; // already playing
  if (!checkBet("minesBet")) return;
  const bet       = getBet("minesBet");
  const mineCount = parseInt(document.getElementById("mineCount").value);
  const { gdiceSpent, chipsSpent } = splitBet(bet);

  const bombs = [];
  while (bombs.length < mineCount) {
    const r = Math.floor(Math.random()*25);
    if (!bombs.includes(r)) bombs.push(r);
  }

  mg = { active:true, bombs, revealed:[], bet, gems:0, mineCount, gdiceSpent, chipsSpent };
  mCashingOut = false;

  document.getElementById("mBetArea").classList.add("hidden");
  document.getElementById("mCashBtn").classList.remove("hidden");
  document.getElementById("mineCount").disabled = true;
  buildGrid();
}

function reveal(idx) {
  if (!mg.active || mg.revealed.includes(idx)) return;
  mg.revealed.push(idx);
  const cell = document.querySelector(`.m-cell[data-i="${idx}"]`);

  if (mg.bombs.includes(idx)) {
    cell.className="m-cell bomb"; cell.textContent="💣";
    mg.active = false;
    mg.bombs.forEach(b => {
      const bc=document.querySelector(`.m-cell[data-i="${b}"]`);
      if (bc) { bc.className="m-cell bomb"; bc.textContent="💣"; }
    });
    document.getElementById("mCashBtn").classList.add("hidden");
    finishBet("Mines", mg.bet, 0, 0, false, mg.gdiceSpent, mg.chipsSpent);
    toast("💣 BOOM! Lost "+fmtD(mg.bet), "lose");
    setTimeout(resetMines, 2000);
  } else {
    mg.gems++;
    cell.className="m-cell gem"; cell.textContent="💎";
    const multi  = calcMulti(mg.mineCount, mg.gems);
    const profit = mg.bet*(multi-1);
    document.getElementById("mGems").textContent   = mg.gems;
    document.getElementById("mMulti").textContent  = multi.toFixed(2)+"×";
    document.getElementById("mProfit").textContent = fmtD(profit);
  }
}

async function minesCashout() {
  if (!mg.active || mg.gems === 0) { toast("Find at least one gem first!", "info"); return; }
  if (mCashingOut) return;
  mCashingOut = true;
  mg.active   = false;

  const multi  = calcMulti(mg.mineCount, mg.gems);
  const payout = parseFloat((mg.bet*multi).toFixed(4));

  document.getElementById("mCashBtn").classList.add("hidden");
  await finishBet("Mines", mg.bet, multi, payout, true, mg.gdiceSpent, mg.chipsSpent);
  toast("Cashed out "+multi.toFixed(2)+"× · +"+fmtD(payout-mg.bet), "win");
  setTimeout(resetMines, 1500);
}

function resetMines() {
  mg = { active:false, bombs:[], revealed:[], bet:0, gems:0, mineCount:3, gdiceSpent:0, chipsSpent:0 };
  mCashingOut = false;
  document.getElementById("mBetArea").classList.remove("hidden");
  document.getElementById("mCashBtn").classList.add("hidden");
  document.getElementById("mineCount").disabled = false;
  buildGrid();
}

