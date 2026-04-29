// ─────────────────────────────────────────────────────────────
//  slots.js
// ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => { await fillShell(); });

const SYMS    = ["🍒","🍋","🍇","⭐","7️⃣","💎"];
const WEIGHTS = [30, 25, 20, 12, 8, 5];
const PAYS    = {"🍒🍒🍒":2,"🍋🍋🍋":3,"🍇🍇🍇":5,"⭐⭐⭐":10,"7️⃣7️⃣7️⃣":15,"💎💎💎":20};

function pick() {
  let r = Math.random() * 100, acc = 0;
  for (let i = 0; i < SYMS.length; i++) { acc += WEIGHTS[i]; if (r < acc) return SYMS[i]; }
  return SYMS[0];
}

async function playSlots() {
  if (!checkBet("slotsBet")) return;
  const bet = getBet("slotsBet");
  const btn = document.getElementById("slotsBtn");
  btn.disabled = true;

  const ivs = [0,1,2].map(i => {
    const r = document.getElementById("reel"+i);
    r.classList.add("spinning");
    return setInterval(() => r.textContent = SYMS[Math.floor(Math.random()*SYMS.length)], 80);
  });

  const results = [];
  for (let i = 0; i < 3; i++) {
    await sleep(400 + i*300);
    clearInterval(ivs[i]);
    const r = document.getElementById("reel"+i);
    r.classList.remove("spinning");
    const s = pick(); r.textContent = s; results.push(s);
  }

  const key    = results.join("");
  const multi  = PAYS[key] || 0;
  const win    = multi > 0;
  const payout = win ? parseFloat((bet * multi).toFixed(2)) : 0;

  await finishBet("Slots", bet, multi, payout, win);
  showResult("slotsResult", win,
    win ? "🎰" : "💸",
    win ? `${multi}× WIN!` : "No match",
    `${results.join(" ")} · ${win ? "+" + fmtD(bet*(multi-1)) : "Lost " + fmtD(bet)}`
  );
  toast(win ? `${multi}× WIN! +${fmtD(bet*(multi-1))}` : `-${fmtD(bet)}`, win ? "win" : "lose");
  btn.disabled = false;
}
