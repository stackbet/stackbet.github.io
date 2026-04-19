// ─────────────────────────────────────────────────────────────
//  session.js  —  Login session + device token (auto-login)
//
//  HOW AUTO-LOGIN WORKS:
//  1. When a user logs in with a code, we generate a random
//     "device token" and store it in TWO places:
//       - localStorage (stays in the browser forever)
//       - Supabase saved_devices table (server side)
//  2. Next time they open the site, we find the token in
//     localStorage and look it up in the DB. If it's there,
//     we log them in automatically — no code needed.
//  3. When they click Logout, we DELETE the token from both
//     places, so that device won't auto-login anymore.
//  4. A user can have multiple tokens (one per device).
// ─────────────────────────────────────────────────────────────

const SESSION_KEY = "sb_user";
const TOKEN_KEY   = "sb_device_token";

// ── In-memory session (survives page navigation in same tab) ──
function sessionSave(user)        { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function sessionGet()             { const r = sessionStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; }
function sessionClear()           { sessionStorage.removeItem(SESSION_KEY); }
function sessionSetBalance(b)     { const u = sessionGet(); if (u) { u.balance = b; sessionSave(u); } }

// ── Device token stored in localStorage ───────────────────────
function getDeviceToken()         { return localStorage.getItem(TOKEN_KEY); }
function setDeviceToken(token)    { localStorage.setItem(TOKEN_KEY, token); }
function clearDeviceToken()       { localStorage.removeItem(TOKEN_KEY); }

// Generate a random token string (32 chars)
function makeDeviceToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Called after a successful code login ──────────────────────
// Saves a device token so this computer won't need to log in again.
async function saveThisDevice(discordId) {
  const token = makeDeviceToken();
  setDeviceToken(token);
  try {
    await dbSaveDeviceToken(discordId, token);
  } catch (e) {
    console.warn("Could not save device token:", e.message);
  }
}

// ── Called on every protected page and the login page ─────────
// If the user is already in sessionStorage, return them immediately.
// If not, check localStorage for a device token and auto-login.
// Returns the user object, or null if not logged in.
async function resolveSession() {
  // 1. Already logged in this tab?
  const existing = sessionGet();
  if (existing) return existing;

  // 2. Do we have a saved device token on this computer?
  const token = getDeviceToken();
  if (!token) return null;

  // 3. Look it up in the database
  try {
    const user = await dbLookupDeviceToken(token);
    if (!user) {
      // Token doesn't exist in DB anymore (was logged out from another device)
      clearDeviceToken();
      return null;
    }
    // Auto-login — restore the session
    sessionSave({
      discord_id: user.discord_id,
      username:   user.username,
      avatar:     user.avatar,
      balance:    user.balance,
    });
    return sessionGet();
  } catch (e) {
    console.warn("Auto-login failed:", e.message);
    return null;
  }
}

// ── requireLogin — call this on every protected page ──────────
// Checks session + device token. If neither works, goes to login.
// Because it's async, call it as: const u = await requireLoginAsync();
async function requireLoginAsync() {
  const u = await resolveSession();
  if (!u) { window.location.href = "login.html"; return null; }
  return u;
}

// Sync version still works if session is already loaded in this tab
function requireLogin() {
  const u = sessionGet();
  if (!u) { window.location.href = "login.html"; return null; }
  return u;
}

// ── Logout — removes token from DB + localStorage ─────────────
async function logout() {
  const token = getDeviceToken();
  try {
    await dbDeleteDeviceToken(token); // remove from DB
  } catch (e) {
    console.warn("Could not remove device token from DB:", e.message);
  }
  clearDeviceToken(); // remove from this browser
  sessionClear();     // clear the in-memory session
  window.location.href = "login.html";
}
