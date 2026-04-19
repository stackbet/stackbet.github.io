// ─────────────────────────────────────────────────────────────
//  coinflip.js
// ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => { await fillShell(); });

let cfPick = "heads";

function pickSide(side) {
  cfPick = side;
  document.getElementById("btnHeads").className = "cf-btn" + (side==="heads" ? " sel-heads" : "");
  document.getElementById("btnTails").className = "cf-btn" + (side==="tails" ? " sel-tails" : "");
}

async function playCoinflip() {
  if (!checkBet("cfBet")) return;
  const bet = getBet("cfBet");
  const btn = document.getElementById("cfPlayBtn");
  btn.disabled = true;

  const coin = document.getElementById("coinVis");
  coin.textContent = "🪙";
  coin.classList.add("spin");
  await sleep(900);
  coin.classList.remove("spin");

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const win    = result === cfPick;
  const payout = win ? bet * 2 : 0;

  coin.textContent = result === "heads" ? "👑" : "🔵";

  await finishBet("Coinflip", bet, win ? 2 : 0, payout, win);

  showResult("cfResult", win,
    win ? "🎉" : "💸",
    win ? "YOU WIN!" : "YOU LOSE",
    `Landed <strong>${result}</strong> · ${win ? "+" + fmtD(bet) : "Lost " + fmtD(bet)}`
  );
  toast(win ? `+${fmtD(bet)} 🎉` : `-${fmtD(bet)}`, win ? "win" : "lose");
  btn.disabled = false;
}
