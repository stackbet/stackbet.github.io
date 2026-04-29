// ─────────────────────────────────────────────────────────────
//  session.js  —  Login session + device token (auto-login)
// ─────────────────────────────────────────────────────────────

const SESSION_KEY = "sb_user";
const TOKEN_KEY   = "sb_device_token";

function sessionSave(user)        { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function sessionGet()             { const r = sessionStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; }
function sessionClear()           { sessionStorage.removeItem(SESSION_KEY); }
function sessionSetBalance(b)     { const u = sessionGet(); if (u && b !== undefined && !isNaN(b)) { u.balance = parseFloat(b); sessionSave(u); } }
function sessionSetGdice(g)       { const u = sessionGet(); if (u && g !== undefined && !isNaN(g)) { u.gdice = Math.max(0, parseFloat(g)); sessionSave(u); } }
function sessionSetBoth(b, g)     { const u = sessionGet(); if (!u) return; if (b !== undefined && !isNaN(b)) u.balance = parseFloat(b); if (g !== undefined && !isNaN(g)) u.gdice = Math.max(0, parseFloat(g)); sessionSave(u); }

function getDeviceToken()         { return localStorage.getItem(TOKEN_KEY); }
function setDeviceToken(token)    { localStorage.setItem(TOKEN_KEY, token); }
function clearDeviceToken()       { localStorage.removeItem(TOKEN_KEY); }

function makeDeviceToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function saveThisDevice(discordId) {
  const token = makeDeviceToken();
  setDeviceToken(token);
  try { await dbSaveDeviceToken(discordId, token); } catch (e) { console.warn("Device token save failed:", e.message); }
}

async function resolveSession() {
  const existing = sessionGet();
  if (existing) return existing;

  const token = getDeviceToken();
  if (!token) return null;

  try {
    const user = await dbLookupDeviceToken(token);
    if (!user) { clearDeviceToken(); return null; }
    sessionSave({
      discord_id: user.discord_id,
      username:   user.username,
      avatar:     user.avatar,
      balance:    user.balance,
      gdice:      user.gdice || 0,
    });
    return sessionGet();
  } catch (e) {
    console.warn("Auto-login failed:", e.message);
    return null;
  }
}

async function requireLoginAsync() {
  const u = await resolveSession();
  if (!u) { window.location.href = "login.html"; return null; }
  return u;
}

function requireLogin() {
  const u = sessionGet();
  if (!u) { window.location.href = "login.html"; return null; }
  return u;
}

async function logout() {
  const token = getDeviceToken();
  try { await dbDeleteDeviceToken(token); } catch (e) { console.warn("Logout token delete:", e.message); }
  clearDeviceToken();
  sessionClear();
  window.location.href = "login.html";
}
