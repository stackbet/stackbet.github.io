// ─────────────────────────────────────────────────────────────
//  db.js  —  All database calls the website makes.
// ─────────────────────────────────────────────────────────────

function sbHeaders() {
  return {
    "apikey":        SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
  };
}

// Headers for writes that don't need the response body back
function sbWriteHeaders() {
  return {
    "apikey":        SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
  };
}

async function sbGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: sbHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "DB read error");
  return data;
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: sbWriteHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || d.error || "DB write error");
  }
}

// Like sbPost but returns the created row (uses return=representation)
async function sbPostReturn(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: sbHeaders(), body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "DB write error");
  return Array.isArray(data) ? data[0] : data;
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: "PATCH", headers: sbWriteHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || d.error || "DB update error");
  }
}

async function sbDelete(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: "DELETE", headers: sbHeaders(),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "DB delete error"); }
}

// ── Login ─────────────────────────────────────────────────────
async function dbVerifyCode(code) {
  const now  = Math.floor(Date.now() / 1000);
  const rows = await sbGet("login_codes", `?code=eq.${code.toUpperCase()}`);
  if (!rows.length) throw new Error("Invalid code. Use .link in Discord to get one.");
  const row = rows[0];
  if (row.expires_at < now) {
    await sbDelete("login_codes", `?code=eq.${code.toUpperCase()}`);
    throw new Error("Code expired. Type .link again to get a new one.");
  }
  await sbDelete("login_codes", `?code=eq.${code.toUpperCase()}`);
  const users = await sbGet("users", `?discord_id=eq.${row.discord_id}`);
  if (!users.length) throw new Error("Account not found.");
  return users[0];
}

// ── Bets ──────────────────────────────────────────────────────
//
// Balance math:
//   ON WIN:  newBal = dbBal - chipsSpent + payout
//            newGdice = dbGdice - gdiceSpent
//   ON LOSS: newBal = dbBal - chipsSpent
//            newGdice = dbGdice - gdiceSpent
//
async function dbSaveBet(discordId, username, game, bet, multiplier, payout, win,
                          gdiceSpent = 0, chipsSpent = null) {
  if (chipsSpent === null) chipsSpent = bet - gdiceSpent;

  // Clamp to non-negative numbers just in case
  gdiceSpent = Math.max(0, parseFloat(gdiceSpent) || 0);
  chipsSpent = Math.max(0, parseFloat(chipsSpent) || 0);
  payout     = Math.max(0, parseFloat(payout)     || 0);

  // Read current DB state FIRST (source of truth)
  const users = await sbGet("users", `?discord_id=eq.${discordId}`);
  if (!users.length) throw new Error("User not found");

  const dbBal   = parseFloat(users[0].balance)    || 0;
  const dbGdice = parseFloat(users[0].gdice || 0) || 0;

  // Validate: make sure they actually have enough on the DB side
  if (chipsSpent > dbBal + 0.0001)
    throw new Error(`Insufficient chips (have ${dbBal.toFixed(4)}, need ${chipsSpent.toFixed(4)})`);
  if (gdiceSpent > dbGdice + 0.0001)
    gdiceSpent = dbGdice; // clamp silently — gdice may have drifted

  const newBal   = parseFloat(Math.max(0, win
    ? dbBal - chipsSpent + payout
    : dbBal - chipsSpent
  ).toFixed(4));
  const newGdice = parseFloat(Math.max(0, dbGdice - gdiceSpent).toFixed(4));

  // Write bet record and update balance in parallel
  await Promise.all([
    sbPost("bets", {
      discord_id: discordId, username, game, bet, multiplier, payout, win,
      created_at: Math.floor(Date.now() / 1000),
    }),
    sbPatch("users", `?discord_id=eq.${discordId}`, { balance: newBal, gdice: newGdice }),
  ]);

  return { balance: newBal, gdice: newGdice };
}

// ── Dashboard ─────────────────────────────────────────────────
async function dbLeaderboard() { return sbGet("users", "?order=balance.desc&limit=10"); }
async function dbFeed()        { return sbGet("bets",  "?win=eq.true&order=created_at.desc&limit=20"); }

// ── Device tokens ─────────────────────────────────────────────
async function dbSaveDeviceToken(discordId, token) {
  await sbPost("saved_devices", { token, discord_id: discordId, created_at: Math.floor(Date.now() / 1000) });
}

async function dbLookupDeviceToken(token) {
  const rows = await sbGet("saved_devices", `?token=eq.${token}`);
  if (!rows.length) return null;
  const users = await sbGet("users", `?discord_id=eq.${rows[0].discord_id}`);
  if (!users.length) return null;
  return users[0];
}

async function dbDeleteDeviceToken(token) {
  if (!token) return;
  await sbDelete("saved_devices", `?token=eq.${token}`);
}

// ── Promo codes ───────────────────────────────────────────────
async function dbRedeemCode(code, discordId) {
  const now = Math.floor(Date.now() / 1000);
  const codes = await sbGet("promo_codes", `?code=eq.${code.toUpperCase()}`);
  if (!codes.length) throw new Error("Invalid code.");

  const c = codes[0];
  if (c.expires_type === "date" && c.expires_at && now > c.expires_at)
    throw new Error("This code has expired.");
  if (c.expires_type === "uses" && c.max_uses !== null && c.uses >= c.max_uses)
    throw new Error("This code has run out of uses.");

  const already = await sbGet("promo_redemptions",
    `?code=eq.${code.toUpperCase()}&discord_id=eq.${discordId}`);
  if (already.length) throw new Error("You already redeemed this code.");

  await sbPost("promo_redemptions", { code: code.toUpperCase(), discord_id: discordId, redeemed_at: now });
  await sbPatch("promo_codes", `?code=eq.${code.toUpperCase()}`, { uses: c.uses + 1 });

  const users = await sbGet("users", `?discord_id=eq.${discordId}`);
  if (!users.length) throw new Error("Account not found.");
  const newGdice = parseFloat(((users[0].gdice || 0) + c.gdice_amount).toFixed(4));
  await sbPatch("users", `?discord_id=eq.${discordId}`, { gdice: newGdice });

  return { gdice_amount: c.gdice_amount, new_gdice: newGdice };
}
