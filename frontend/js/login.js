// ─────────────────────────────────────────────────────────────
//  login.js
// ─────────────────────────────────────────────────────────────

// ── Helper: fill boxes from a string ──────────────────────────
function fillBoxes(str) {
  // Strip anything that's not A-Z or 0-9, uppercase it, take first 6
  const clean = str.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  for (let i = 0; i < 6; i++) {
    document.getElementById("c" + i).value = clean[i] || "";
  }
  // Focus the next empty box, or the last box if all filled
  const next = clean.length < 6 ? clean.length : 5;
  document.getElementById("c" + next).focus();
}

// ── Typing one character at a time ────────────────────────────
function codeType(i) {
  const el = document.getElementById("c" + i);
  // Allow only one valid char
  el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
  if (el.value && i < 5) document.getElementById("c" + (i + 1)).focus();
}

// ── Backspace goes to previous box ────────────────────────────
function codeBack(e, i) {
  if (e.key === "Backspace" && !document.getElementById("c" + i).value && i > 0) {
    document.getElementById("c" + (i - 1)).focus();
  }
  if (e.key === "Enter") doLogin();
}

// ── Paste handler — attached to every box ─────────────────────
function codePaste(e, i) {
  e.preventDefault(); // stop the default single-char paste
  const pasted = (e.clipboardData || window.clipboardData).getData("text");
  fillBoxes(pasted);
}

// ── Read the full 6-char code from all boxes ──────────────────
function getCode() {
  return Array.from({ length: 6 }, (_, i) => document.getElementById("c" + i).value).join("");
}

// ── Error display ──────────────────────────────────────────────
function showErr(msg) {
  const el = document.getElementById("loginErr");
  el.textContent = msg;
  el.style.display = "block";
}
function hideErr() {
  document.getElementById("loginErr").style.display = "none";
}

// ── Main login function ────────────────────────────────────────
async function doLogin() {
  hideErr();
  const code = getCode();
  if (code.length < 6) { showErr("Please enter all 6 characters."); return; }

  const btn = document.querySelector(".btn-enter");
  btn.textContent = "Verifying...";
  btn.disabled = true;

  try {
    const user = await dbVerifyCode(code);

    sessionSave({
      discord_id: user.discord_id,
      username:   user.username,
      avatar:     user.avatar,
      balance:    user.balance,
    });

    // Save device token so this computer auto-logs in next visit
    await saveThisDevice(user.discord_id);

    window.location.href = "dashboard.html";
  } catch (e) {
    showErr(e.message || "Invalid or expired code. Use .link in Discord.");
    btn.textContent = "Enter Casino";
    btn.disabled = false;
  }
}

// ── On page load: check for saved device token ────────────────
window.addEventListener("DOMContentLoaded", async () => {
  const wrap = document.querySelector(".login-wrap");

  const token = getDeviceToken();
  if (token) {
    if (wrap) wrap.style.opacity = "0.5";
    try {
      const user = await dbLookupDeviceToken(token);
      if (user) {
        sessionSave({
          discord_id: user.discord_id,
          username:   user.username,
          avatar:     user.avatar,
          balance:    user.balance,
        });
        window.location.href = "dashboard.html";
        return;
      } else {
        clearDeviceToken();
      }
    } catch (e) {
      // DB unreachable — show login form
    }
    if (wrap) wrap.style.opacity = "1";
  }

  document.getElementById("c0").focus();
});
