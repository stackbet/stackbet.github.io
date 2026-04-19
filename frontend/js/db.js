// ─────────────────────────────────────────────────────────────
//  db.js  —  All database calls the website makes.
//  Uses the Supabase REST API directly (no extra libraries).
// ─────────────────────────────────────────────────────────────

function sbHeaders() {
  return {
    "apikey":        SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
  };
}

async function sbGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    headers: sbHeaders()
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "DB read error");
  return data;
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  "POST",
    headers: sbHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "DB write error");
  return Array.isArray(data) ? data[0] : data;
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method:  "PATCH",
    headers: sbHeaders(),
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "DB update error");
  return Array.isArray(data) ? data[0] : data;
}

async function sbDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method:  "DELETE",
    headers: sbHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "DB delete error");
  }
}

// ── Named helpers used by the website ────────────────────────

// Called on login page: verify a 6-char code and return the user
async function dbVerifyCode(code) {
  const now = Math.floor(Date.now() / 1000);

  // Look up the code
  const rows = await sbGet("login_codes", `?code=eq.${code.toUpperCase()}`);
  if (!rows.length) throw new Error("Invalid code. Use .link in Discord to get one.");

  const row = rows[0];
  if (row.expires_at < now) {
    await sbDelete("login_codes", `?code=eq.${code.toUpperCase()}`);
    throw new Error("Code expired. Type .link again to get a new one.");
  }

  // Delete the code so it can't be reused
  await sbDelete("login_codes", `?code=eq.${code.toUpperCase()}`);

  // Get the user
  const users = await sbGet("users", `?discord_id=eq.${row.discord_id}`);
  if (!users.length) throw new Error("Account not found.");

  return users[0]; // { discord_id, username, avatar, balance }
}

// Called after every game: save the bet result and return new balance
async function dbSaveBet(discordId, username, game, bet, multiplier, payout, win) {
  // Write the bet record
  await sbPost("bets", {
    discord_id: discordId,
    username:   username,
    game:       game,
    bet:        bet,
    multiplier: multiplier,
    payout:     payout,
    win:        win,
    created_at: Math.floor(Date.now() / 1000),
  });

  // Update the balance
  const users = await sbGet("users", `?discord_id=eq.${discordId}`);
  if (!users.length) throw new Error("User not found");
  const currentBalance = users[0].balance;
  const newBalance = win
    ? parseFloat((currentBalance + payout - bet).toFixed(2))
    : parseFloat((currentBalance - bet).toFixed(2));
  const safe = Math.max(0, newBalance);

  await sbPatch("users", `?discord_id=eq.${discordId}`, { balance: safe });
  return safe;
}

// Called on dashboard: get top 10 players
async function dbLeaderboard() {
  return sbGet("users", "?order=balance.desc&limit=10");
}

// Called on dashboard: get last 20 WINS only (losses are hidden from feed)
async function dbFeed() {
  return sbGet("bets", "?win=eq.true&order=created_at.desc&limit=20");
}

// ── Device token (auto-login) functions ───────────────────────

// Save a device token linked to this discord_id.
// Called right after a successful code login.
async function dbSaveDeviceToken(discordId, token) {
  await sbPost("saved_devices", {
    token:      token,
    discord_id: discordId,
    created_at: Math.floor(Date.now() / 1000),
  });
}

// Look up a device token. Returns the full user object if found,
// or null if the token doesn't exist (never saved or logged out).
async function dbLookupDeviceToken(token) {
  const rows = await sbGet("saved_devices", `?token=eq.${token}`);
  if (!rows.length) return null;

  const discordId = rows[0].discord_id;
  const users = await sbGet("users", `?discord_id=eq.${discordId}`);
  if (!users.length) return null;

  return users[0]; // { discord_id, username, avatar, balance }
}

// Delete a device token. Called on logout so this device
// won't be auto-logged in anymore.
async function dbDeleteDeviceToken(token) {
  if (!token) return;
  await sbDelete("saved_devices", `?token=eq.${token}`);
}
