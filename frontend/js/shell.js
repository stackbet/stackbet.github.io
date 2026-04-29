// ─────────────────────────────────────────────────────────────
//  shell.js  –  Populates the sidebar + topbar on every page
// ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const user = requireLogin();   // bounces to login if not logged in
  if (!user) return;

  // Sidebar name
  const sbName = document.getElementById('sbName');
  if (sbName) sbName.textContent = user.username;

  // Sidebar avatar
  const sbAv = document.getElementById('sbAvatar');
  if (sbAv) {
    if (user.avatar) {
      sbAv.innerHTML = `<img src="${user.avatar}" alt="" onerror="this.parentElement.textContent='${user.username.slice(0,2).toUpperCase()}'">`;
    } else {
      sbAv.textContent = user.username.slice(0, 2).toUpperCase();
    }
  }

  // Topbar balance
  refreshBalanceUI();
});

function refreshBalanceUI() {
  const user = getUser();
  if (!user) return;
  const topBal = document.getElementById('topBal');
  if (topBal) topBal.textContent = fmt(user.balance);
}

// ── TOAST ──────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}
