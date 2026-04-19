// ─────────────────────────────────────────────────────────────
//  api.js  –  All communication with the Python backend server
//  The backend runs on localhost:5000 by default.
// ─────────────────────────────────────────────────────────────

const API = 'http://localhost:5000';

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

async function apiGet(path) {
  const res = await fetch(API + path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

// Verify the 6-char login code the Discord bot gave the user.
// Returns: { userId, username, avatar, balance }
async function apiVerifyCode(code) {
  return apiPost('/api/verify', { code });
}

// Get the user's current balance from the server.
async function apiGetBalance(userId) {
  return apiGet(`/api/balance/${userId}`);
}

// Save a completed bet result to the server (updates balance).
// Returns: { newBalance }
async function apiSaveBet(userId, { game, bet, multiplier, payout, win }) {
  return apiPost('/api/bet', { userId, game, bet, multiplier, payout, win });
}

// Get the leaderboard (top players by balance).
async function apiLeaderboard() {
  return apiGet('/api/leaderboard');
}

// Get recent bets feed.
async function apiFeed() {
  return apiGet('/api/feed');
}
