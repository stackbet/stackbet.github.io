// ─────────────────────────────────────────────────────────────
//  state.js  –  User session stored in sessionStorage
//  sessionStorage clears when the browser tab is closed,
//  so the user has to log in again each new session.
// ─────────────────────────────────────────────────────────────

const STATE_KEY = 'stackbet_user';

function saveUser(user) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify(user));
}

function getUser() {
  const raw = sessionStorage.getItem(STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearUser() {
  sessionStorage.removeItem(STATE_KEY);
}

function updateBalance(newBalance) {
  const u = getUser();
  if (!u) return;
  u.balance = newBalance;
  saveUser(u);
}

function logout() {
  clearUser();
  window.location.href = 'login.html';
}

// Guard: if no user is logged in, bounce to login page.
// Call this at the top of every page that requires login.
function requireLogin() {
  const u = getUser();
  if (!u) {
    window.location.href = 'login.html';
    return null;
  }
  return u;
}
