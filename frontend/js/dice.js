// ─────────────────────────────────────────────────────────────
//  dice.js
// ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => { await fillShell(); updateDice(); });

let diceMode = "over";

function setMode(mode) {
  diceMode = mode;
  document.getElementById("btnOver").className  = "ou-btn" + (mode==="over"  ? " active" : "");
  document.getElementById("btnUnder").className = "ou-btn" + (mode==="under" ? " active" : "");
  updateDice();
}

function updateDice() {
  const val    = parseInt(document.getElementById("diceSlider").value);
  const chance = diceMode==="over" ? (99 - val) : (val - 1);
  const safe   = Math.max(1, Math.min(98, chance));
  const multi  = parseFloat((100 / safe * 0.96).toFixed(2));
  document.getElementById("diceNum").textContent    = val;
  document.getElementById("diceChance").textContent = safe + "%";
  document.getElementById("diceMulti").textContent  = multi + "×";
}

async function playDice() {
  if (!checkBet("diceBet")) return;
  const bet    = getBet("diceBet");
  const target = parseInt(document.getElementById("diceSlider").value);
  const chance = diceMode==="over" ? (99-target) : (target-1);
  const multi  = parseFloat((100 / Math.max(1,chance) * 0.96).toFixed(2));

  ["die1","die2"].forEach(id => {
    const d = document.getElementById(id);
    d.classList.add("roll"); d.textContent = "?"; d.style.color = "";
  });
  await sleep(600);

  const roll   = Math.floor(Math.random() * 100) + 1;
  const win    = diceMode==="over" ? roll > target : roll < target;
  const payout = win ? parseFloat((bet * multi).toFixed(2)) : 0;

  const faces  = ["","⚀","⚁","⚂","⚃","⚄","⚅"];
  ["die1","die2"].forEach((id, i) => {
    const d = document.getElementById(id);
    d.classList.remove("roll");
    d.textContent = faces[Math.floor(Math.random()*6)+1];
    d.style.color = win ? "var(--green)" : "var(--red)";
  });

  await finishBet("Dice", bet, win ? multi : 0, payout, win);
  showResult("diceResult", win,
    win ? "🎲" : "💸",
    win ? "YOU WIN!" : "YOU LOSE",
    `Rolled <strong>${roll}</strong> · Target: ${diceMode} ${target} · ${win ? "+" + fmtD(bet*(multi-1)) : "Lost " + fmtD(bet)}`
  );
  toast(win ? `+${fmtD(bet*(multi-1))} 🎲` : `-${fmtD(bet)}`, win ? "win" : "lose");
}
