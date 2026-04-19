"""
StackBet bot.py
═══════════════════════════════════════════════════════════════════
Runs two things in one process:

  1. Discord bot  — only .link command (creates website login code)
  2. HTTP API on port 5001 — deposit page polls this

Minecraft deposit flow:
  Step 1 — Verification:
    User types  /msg VRVRxX <code>  in Minecraft chat.
    Bot detects the whisper, links MC username to Discord account.
    Bot replies in-game confirming verification.

  Step 2 — Payment:
    User types  /pay VRVRxX <amount>  in Minecraft.
    Bot reads "You received $X from <username>" in chat.
    Bot automatically calculates chips (mc_amount / rate) and
    credits the user's Supabase balance. No admin needed.

Withdraw flow:
  Website sends POST /withdraw { discord_id, server_key, mc_username, mc_amount }
  Bot types  /pay <mc_username> <mc_amount>  on the correct server.
  Chips (mc_amount / rate) are deducted from the user's balance.

Chat output rules:
  - Normal MC chat is NOT printed (silent).
  - Deposit received    → printed with green ✅
  - Withdraw sent       → printed with yellow 💸
  - Verification codes  → printed
  - Errors / connect    → always printed

Requirements:
  pip install discord.py aiohttp python-dotenv javascript
  npm install mineflayer          (in the bot/ folder)

.env keys:
  DISCORD_TOKEN
  SUPABASE_URL
  SUPABASE_KEY
═══════════════════════════════════════════════════════════════════
"""

import asyncio
import json
import os
import random
import re
import string
import sys
import threading
import time
from pathlib import Path

import aiohttp
import discord
from aiohttp import web as aiohttp_web
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# ═══════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
SUPABASE_URL  = os.getenv("SUPABASE_URL",  "").rstrip("/")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY",  "")

BOT_MC_NAME   = "VRVRxX"   # Minecraft bot username
API_PORT      = 5001        # HTTP API port the website calls

# ── Server registry ───────────────────────────────────────────
# rate = MC dollars needed to earn 1 chip
# To add a server: add an entry here. Nothing else needs changing.
SERVERS: dict[str, dict] = {
    "FluxSMP": {
        "host":    "flux.mine.bz",
        "port":    50169,
        "display": "FluxSMP",
        "rate":    125,          # $125 FluxSMP = 1 chip
    },
    "DonutSMP": {
        "host":    "donutsmp.net",
        "port":    25565,
        "display": "DonutSMP",
        "rate":    210,          # $210 DonutSMP = 1 chip
    },
}

# ═══════════════════════════════════════════════════════════════
#  SHARED STATE
# ═══════════════════════════════════════════════════════════════
# Active mineflayer bot per server key  (None = not connected)
mc_bots:       dict[str, object] = {k: None for k in SERVERS}
_reconnecting: dict[str, bool]   = {k: False for k in SERVERS}

# Deposit sessions: session_id → session dict
# session dict keys:
#   server_key, discord_id, code, started_at,
#   verified, mc_username, active, chips_per_payment
deposit_sessions: dict[str, dict] = {}

# Pending verification codes: code → session_id
pending_codes: dict[str, str] = {}

# Verified MC usernames awaiting payment, per server:
#   server_key → { mc_username_lower → session_id }
# Used by the deposit reader to attribute incoming payments.
verified_players: dict[str, dict] = {k: {} for k in SERVERS}

# Dedup recent payments: "server:mc_user:amount" → timestamp
_recent_payments: dict[str, float] = {}

# Discord event loop ref
_discord_loop: asyncio.AbstractEventLoop | None = None

# ═══════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════
_COLOUR_RE = re.compile(r"§[0-9a-fk-orx]", re.IGNORECASE)

def strip_colours(s: str) -> str:
    return _COLOUR_RE.sub("", s)

def make_code(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))

def _has_active_session(server_key: str) -> bool:
    return any(
        s["server_key"] == server_key and s.get("active")
        for s in deposit_sessions.values()
    )

def chips_from(mc_amount: float, server_key: str) -> float:
    return round(mc_amount / SERVERS[server_key]["rate"], 4)

def mc_from(chips: float, server_key: str) -> float:
    return round(chips * SERVERS[server_key]["rate"], 2)

# ═══════════════════════════════════════════════════════════════
#  SUPABASE  (async helpers)
# ═══════════════════════════════════════════════════════════════
def _sb_h() -> dict:
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }

async def sb_get(http: aiohttp.ClientSession, table: str, q: str = "") -> list:
    async with http.get(f"{SUPABASE_URL}/rest/v1/{table}{q}", headers=_sb_h()) as r:
        d = await r.json()
        if r.status >= 400:
            raise RuntimeError(f"GET {table} {r.status}: {d}")
        return d

async def sb_post(http: aiohttp.ClientSession, table: str, body: dict):
    async with http.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=_sb_h(), json=body) as r:
        if r.status >= 400:
            d = await r.json()
            raise RuntimeError(f"POST {table} {r.status}: {d}")

async def sb_patch(http: aiohttp.ClientSession, table: str, q: str, body: dict):
    async with http.patch(f"{SUPABASE_URL}/rest/v1/{table}{q}", headers=_sb_h(), json=body) as r:
        if r.status >= 400:
            d = await r.json()
            raise RuntimeError(f"PATCH {table} {r.status}: {d}")

async def sb_delete(http: aiohttp.ClientSession, table: str, q: str):
    async with http.delete(f"{SUPABASE_URL}/rest/v1/{table}{q}", headers=_sb_h()) as r:
        if r.status >= 400:
            d = await r.json()
            raise RuntimeError(f"DELETE {table} {r.status}: {d}")

# ─── Credit chips to a user (thread-safe via event loop) ──────
def _credit_chips_threadsafe(discord_id: str, chips: float, server_key: str, mc_user: str, mc_amount: float):
    """Called from the MC bot thread. Schedules async DB update on the Discord loop."""
    if _discord_loop is None:
        return
    asyncio.run_coroutine_threadsafe(
        _do_credit(discord_id, chips, server_key, mc_user, mc_amount),
        _discord_loop,
    )

async def _do_credit(discord_id: str, chips: float, server_key: str, mc_user: str, mc_amount: float):
    try:
        async with aiohttp.ClientSession() as http:
            rows = await sb_get(http, "users", f"?discord_id=eq.{discord_id}")
            if not rows:
                print(f"[Deposit] ❌ User {discord_id} not found in DB")
                return
            new_bal = round(float(rows[0]["balance"]) + chips, 4)
            await sb_patch(http, "users", f"?discord_id=eq.{discord_id}", {"balance": new_bal})
        display = SERVERS[server_key]["display"]
        print(f"[Deposit] ✅ +{chips} chips → {discord_id}  "
              f"({mc_user} paid ${mc_amount:,} on {display})")
    except Exception as e:
        print(f"[Deposit] ❌ DB credit failed for {discord_id}: {e}")

# ═══════════════════════════════════════════════════════════════
#  MINECRAFT BOT
# ═══════════════════════════════════════════════════════════════

# Whisper pattern:  [SenderName -> me] CODE123
_WHISPER_RE = re.compile(r"\[(\S+)\s*->\s*\w+\]\s+([A-Z0-9]{6})\s*$")

# Payment received pattern (from the server, shown to the bot):
#   "You received $5,000 from Steve"
#   "You received $1.5K from Steve"
_RECEIVED_RE = re.compile(
    r"You received \$?([\d,]+(?:\.\d+)?[KkMmBbTt]?)\s+from\s+(\S+)",
    re.IGNORECASE,
)


def _parse_mc_amount(raw: str) -> float:
    """Parse "5K", "1.5M", "1,500" etc. into a float."""
    raw = raw.strip().replace(",", "").upper()
    suffixes = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000, "T": 1_000_000_000_000}
    try:
        if raw and raw[-1] in suffixes:
            return float(raw[:-1]) * suffixes[raw[-1]]
        return float(raw)
    except (ValueError, IndexError):
        return 0.0


def _handle_chat(server_key: str, message: str):
    """
    Called for every MC chat line (already stripped of colour codes).
    Checks for:
      1. Verification whispers  → marks session verified
      2. Payment received       → credits chips automatically
    Everything else is ignored silently.
    """
    # ── 1. Verification whisper ──────────────────────────────
    wm = _WHISPER_RE.search(message)
    if wm:
        mc_user    = wm.group(1)
        code       = wm.group(2).upper()
        session_id = pending_codes.get(code)
        if session_id:
            sess = deposit_sessions.get(session_id)
            if sess and sess["server_key"] == server_key and sess.get("active"):
                sess["verified"]    = True
                sess["mc_username"] = mc_user
                pending_codes.pop(code, None)
                # Register this MC user as waiting for payment on this server
                verified_players[server_key][mc_user.lower()] = session_id
                print(f"[Verify] ✅ {mc_user} verified with code {code} (session {session_id})")
                # Send in-game confirmation
                bot = mc_bots.get(server_key)
                if bot:
                    rate  = SERVERS[server_key]["rate"]
                    try:
                        bot.chat(
                            f"/msg {mc_user} "
                            f"Verified! Now type /pay {BOT_MC_NAME} <amount>. "
                            f"Every ${rate:,} = 1 chip."
                        )
                    except Exception:
                        pass
        return

    # ── 2. Payment received ──────────────────────────────────
    pm = _RECEIVED_RE.search(message)
    if pm:
        raw_amount = pm.group(1)
        mc_user    = pm.group(2)
        mc_amount  = _parse_mc_amount(raw_amount)

        if mc_amount <= 0:
            return

        # Dedup: same user + same amount within 3 s
        dedup_key = f"{server_key}:{mc_user.lower()}:{mc_amount}"
        now = time.time()
        if now - _recent_payments.get(dedup_key, 0) < 3.0:
            return
        _recent_payments[dedup_key] = now

        # Find the verified session for this MC username
        session_id = verified_players[server_key].get(mc_user.lower())
        if not session_id:
            # No known session — log but do nothing
            print(f"[Deposit] ⚠️  Payment from unknown user {mc_user} on {server_key} (${mc_amount:,})")
            return

        sess = deposit_sessions.get(session_id)
        if not sess:
            verified_players[server_key].pop(mc_user.lower(), None)
            return

        discord_id = sess["discord_id"]
        chips      = chips_from(mc_amount, server_key)

        # Credit chips (async, safe from thread)
        _credit_chips_threadsafe(discord_id, chips, server_key, mc_user, mc_amount)
        return


def _start_mc_bot(server_key: str):
    """Start a mineflayer bot for the given server (runs in background thread)."""
    cfg = SERVERS[server_key]
    print(f"[MC:{server_key}] Connecting to {cfg['host']}:{cfg['port']} ...")

    try:
        from javascript import require, On
        mineflayer = require("mineflayer")
    except Exception as e:
        print(f"[MC:{server_key}] ❌ Cannot load mineflayer: {e}")
        print("  → Install Node.js, then run:  npm install mineflayer")
        return

    _auth_failed = [False]

    bot = mineflayer.createBot({
        "host":    cfg["host"],
        "port":    cfg["port"],
        "auth":    "microsoft",
        "version": False,
    })

    @On(bot, "login")
    def on_login(this):
        mc_bots[server_key] = bot
        _reconnecting[server_key] = False
        print(f"[MC:{server_key}] ✅ Connected as {bot.username}")

    @On(bot, "messagestr")
    def on_chat(this, message, position, jsonMsg, *a):
        cleaned = strip_colours(str(message))
        if cleaned.strip():
            _handle_chat(server_key, cleaned)
        # ← No print here. Chat is read silently.

    @On(bot, "error")
    def on_error(this, err, *a):
        err_s = str(err)
        if "microsoft.com/link" in err_s:
            import webbrowser, re as _re
            m = _re.search(r"(https://microsoft\.com/link\S*)", err_s)
            url = m.group(1) if m else "https://www.microsoft.com/link"
            print(f"[MC:{server_key}] Auth required → {url}")
            webbrowser.open(url)
        elif "profile data" in err_s.lower() or "does the account own minecraft" in err_s.lower():
            _auth_failed[0] = True
            print(f"[MC:{server_key}] ❌ Auth failed. Restart bot to re-authenticate.")
        else:
            print(f"[MC:{server_key}] Error: {err_s}")

    @On(bot, "end")
    def on_end(this, *a):
        mc_bots[server_key] = None
        if not _auth_failed[0]:
            print(f"[MC:{server_key}] Disconnected. Reconnecting in 10 s…")
            _schedule_reconnect(server_key)

    @On(bot, "kicked")
    def on_kicked(this, reason, *a):
        mc_bots[server_key] = None
        print(f"[MC:{server_key}] Kicked: {strip_colours(str(reason))}. Reconnecting in 10 s…")
        _schedule_reconnect(server_key)


def _schedule_reconnect(server_key: str):
    if _reconnecting.get(server_key):
        return
    _reconnecting[server_key] = True

    def _do():
        time.sleep(10)
        _reconnecting[server_key] = False
        if _has_active_session(server_key) or verified_players[server_key]:
            print(f"[MC:{server_key}] Reconnecting…")
            _start_mc_bot(server_key)
        else:
            print(f"[MC:{server_key}] No active sessions — skipping reconnect.")

    threading.Thread(target=_do, daemon=True).start()


def ensure_mc_bot(server_key: str):
    """Start the MC bot for a server if it isn't already running."""
    if mc_bots.get(server_key) is None and not _reconnecting.get(server_key):
        threading.Thread(target=_start_mc_bot, args=(server_key,), daemon=True).start()


# ═══════════════════════════════════════════════════════════════
#  SESSION CLEANUP
# ═══════════════════════════════════════════════════════════════
async def _cleanup_loop():
    """Every 30 s: remove sessions older than 10 min or marked inactive."""
    while True:
        await asyncio.sleep(30)
        now   = time.time()
        stale = [
            sid for sid, s in deposit_sessions.items()
            if not s.get("active") or (now - s["started_at"]) > 600
        ]
        for sid in stale:
            s = deposit_sessions.pop(sid, None)
            if s:
                pending_codes.pop(s.get("code", ""), None)
                mc_u = (s.get("mc_username") or "").lower()
                sv   = s.get("server_key", "")
                if mc_u and sv and verified_players.get(sv, {}).get(mc_u) == sid:
                    verified_players[sv].pop(mc_u, None)
        # Clean old dedup entries (older than 10 s)
        old_keys = [k for k, t in _recent_payments.items() if now - t > 10]
        for k in old_keys:
            _recent_payments.pop(k, None)
        if stale:
            print(f"[Sessions] Cleaned {len(stale)} stale session(s).")


# ═══════════════════════════════════════════════════════════════
#  HTTP API
# ═══════════════════════════════════════════════════════════════
_CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}

def jsend(data: dict, status: int = 200) -> aiohttp_web.Response:
    return aiohttp_web.Response(
        text=json.dumps(data),
        content_type="application/json",
        status=status,
        headers=_CORS,
    )

async def _opts(_): return aiohttp_web.Response(headers=_CORS)


async def route_health(_):
    """GET /health"""
    return jsend({
        "ok":      True,
        "servers": {k: (mc_bots[k] is not None) for k in SERVERS},
    })


async def route_deposit_start(req):
    """
    POST /deposit/start
    Body: { server_key, discord_id }
    → { session_id, code, command, server_display, rate, bot_username, chips_preview }

    Creates a session and boots the MC bot for the chosen server.
    """
    try:
        body = await req.json()
    except Exception:
        return jsend({"error": "invalid JSON"}, 400)

    server_key = str(body.get("server_key", "")).strip()
    discord_id = str(body.get("discord_id", "")).strip()

    if server_key not in SERVERS:
        return jsend({"error": f"Unknown server. Options: {list(SERVERS.keys())}"}, 400)
    if not discord_id:
        return jsend({"error": "discord_id required"}, 400)

    cfg = SERVERS[server_key]

    # Cancel any existing session for this user+server
    for sid, sess in list(deposit_sessions.items()):
        if sess["discord_id"] == discord_id and sess["server_key"] == server_key:
            sess["active"] = False
            pending_codes.pop(sess.get("code", ""), None)
            mc_u = (sess.get("mc_username") or "").lower()
            if mc_u and verified_players[server_key].get(mc_u) == sid:
                verified_players[server_key].pop(mc_u, None)

    session_id = make_code(12)
    code       = make_code(6)

    deposit_sessions[session_id] = {
        "session_id":  session_id,
        "server_key":  server_key,
        "discord_id":  discord_id,
        "code":        code,
        "started_at":  time.time(),
        "verified":    False,
        "mc_username": None,
        "active":      True,
    }
    pending_codes[code] = session_id
    ensure_mc_bot(server_key)

    return jsend({
        "session_id":     session_id,
        "code":           code,
        "command":        f"/msg {BOT_MC_NAME} {code}",
        "server_display": cfg["display"],
        "rate":           cfg["rate"],
        "bot_username":   BOT_MC_NAME,
        # Example: how many chips for 1000 MC dollars
        "chips_per_1000": round(1000 / cfg["rate"], 2),
    })


async def route_deposit_status(req):
    """
    GET /deposit/status?session_id=…
    → { bot_ready, verified, mc_username, active, code, rate }
    """
    sid = req.rel_url.query.get("session_id", "").strip()
    if not sid:
        return jsend({"error": "session_id required"}, 400)

    sess = deposit_sessions.get(sid)
    if not sess:
        return jsend({"error": "session not found"}, 404)

    cfg = SERVERS[sess["server_key"]]
    return jsend({
        "bot_ready":   mc_bots.get(sess["server_key"]) is not None,
        "verified":    sess["verified"],
        "mc_username": sess["mc_username"],
        "active":      sess["active"],
        "code":        sess["code"],
        "server_key":  sess["server_key"],
        "rate":        cfg["rate"],
        "bot_username": BOT_MC_NAME,
    })


async def route_deposit_cancel(req):
    """POST /deposit/cancel  { session_id }"""
    try:
        body = await req.json()
    except Exception:
        return jsend({"error": "invalid JSON"}, 400)

    sid  = body.get("session_id", "").strip()
    sess = deposit_sessions.pop(sid, None)
    if sess:
        pending_codes.pop(sess.get("code", ""), None)
        mc_u = (sess.get("mc_username") or "").lower()
        sv   = sess.get("server_key", "")
        if mc_u and sv and verified_players.get(sv, {}).get(mc_u) == sid:
            verified_players[sv].pop(mc_u, None)
        print(f"[Sessions] Session {sid} cancelled by client.")
    return jsend({"ok": True})


async def route_withdraw(req):
    """
    POST /withdraw
    Body: { discord_id, server_key, mc_username, mc_amount }

    1. Validates user has enough chips.
    2. Deducts chips from Supabase immediately.
    3. Types  /pay <mc_username> <mc_amount>  on the correct MC server.

    Chips deducted = mc_amount / server rate  (same formula as deposit).
    """
    try:
        body = await req.json()
    except Exception:
        return jsend({"error": "invalid JSON"}, 400)

    server_key  = str(body.get("server_key",  "")).strip()
    discord_id  = str(body.get("discord_id",  "")).strip()
    mc_username = str(body.get("mc_username", "")).strip()
    mc_amount   = float(body.get("mc_amount", 0))

    if server_key not in SERVERS:
        return jsend({"error": f"Unknown server. Options: {list(SERVERS.keys())}"}, 400)
    if not discord_id:
        return jsend({"error": "discord_id required"}, 400)
    if not mc_username:
        return jsend({"error": "mc_username required"}, 400)
    if mc_amount <= 0:
        return jsend({"error": "mc_amount must be > 0"}, 400)

    cfg   = SERVERS[server_key]
    chips = chips_from(mc_amount, server_key)

    # Check and deduct balance
    try:
        async with aiohttp.ClientSession() as http:
            rows = await sb_get(http, "users", f"?discord_id=eq.{discord_id}")
            if not rows:
                return jsend({"error": "User not found"}, 404)
            current = float(rows[0]["balance"])
            if current < chips:
                return jsend({
                    "error": f"Insufficient chips. You have {current:.4f}, need {chips:.4f}."
                }, 400)
            new_bal = round(current - chips, 4)
            await sb_patch(http, "users", f"?discord_id=eq.{discord_id}", {"balance": new_bal})
    except Exception as e:
        return jsend({"error": str(e)}, 500)

    # Ensure MC bot is connected
    ensure_mc_bot(server_key)

    # Send the payment command in-game
    bot = mc_bots.get(server_key)
    if bot is None:
        # Refund if bot is offline
        try:
            async with aiohttp.ClientSession() as http:
                await sb_patch(http, "users", f"?discord_id=eq.{discord_id}", {"balance": current})
        except Exception:
            pass
        return jsend({"error": f"MC bot for {server_key} is offline. Please try again in a moment."}, 503)

    try:
        bot.chat(f"/pay {mc_username} {int(mc_amount)}")
    except Exception as e:
        # Refund
        try:
            async with aiohttp.ClientSession() as http:
                await sb_patch(http, "users", f"?discord_id=eq.{discord_id}", {"balance": current})
        except Exception:
            pass
        return jsend({"error": f"Failed to send payment: {e}"}, 500)

    print(f"[Withdraw] 💸 Sent /pay {mc_username} {int(mc_amount)} on {server_key} "
          f"(−{chips} chips from {discord_id})")

    return jsend({
        "ok":          True,
        "chips_spent": chips,
        "new_balance": new_bal,
        "mc_amount":   mc_amount,
        "mc_username": mc_username,
        "server":      cfg["display"],
    })


async def start_api():
    app = aiohttp_web.Application()
    routes = [
        ("GET",  "/health",           route_health),
        ("POST", "/deposit/start",    route_deposit_start),
        ("GET",  "/deposit/status",   route_deposit_status),
        ("POST", "/deposit/cancel",   route_deposit_cancel),
        ("POST", "/withdraw",         route_withdraw),
    ]
    for method, path, handler in routes:
        app.router.add_route(method,    path, handler)
        app.router.add_route("OPTIONS", path, _opts)

    runner = aiohttp_web.AppRunner(app)
    await runner.setup()
    await aiohttp_web.TCPSite(runner, "0.0.0.0", API_PORT).start()
    print(f"[API] ✅ Running on http://0.0.0.0:{API_PORT}")


# ═══════════════════════════════════════════════════════════════
#  DISCORD BOT  — only .link command
# ═══════════════════════════════════════════════════════════════
intents = discord.Intents.default()
intents.message_content = True
discord_bot = discord.Client(intents=intents)


@discord_bot.event
async def on_ready():
    global _discord_loop
    _discord_loop = asyncio.get_event_loop()
    print(f"[Discord] ✅ Online as {discord_bot.user}")
    await start_api()
    asyncio.create_task(_cleanup_loop())


@discord_bot.event
async def on_message(msg: discord.Message):
    if msg.author.bot:
        return
    content = msg.content.strip()

    # Only respond to ".link"
    if content.lower() != ".link":
        return

    did  = str(msg.author.id)
    name = msg.author.name
    av   = str(msg.author.display_avatar.url) if msg.author.display_avatar else None

    async with aiohttp.ClientSession() as http:
        try:
            # Find or create user (starting balance 0)
            rows = await sb_get(http, "users", f"?discord_id=eq.{did}")
            if not rows:
                await sb_post(http, "users", {
                    "discord_id": did,
                    "username":   name,
                    "avatar":     av,
                    "balance":    0.0,
                })
            else:
                await sb_patch(http, "users", f"?discord_id=eq.{did}",
                               {"username": name, "avatar": av})

            # Delete old login codes for this user
            await sb_delete(http, "login_codes", f"?discord_id=eq.{did}")

            # Create a new 6-char code (expires in 5 min)
            code = make_code(6)
            await sb_post(http, "login_codes", {
                "code":       code,
                "discord_id": did,
                "expires_at": int(time.time()) + 300,
            })

            await msg.reply(
                f"🎰 **Your StackBet login code:** `{code}`\n"
                f"Enter this on the website to log in.\n"
                f"*Expires in 5 minutes. Do not share this code.*"
            )

        except Exception as e:
            print(f"[Discord:.link] {type(e).__name__}: {e}")
            await msg.reply(f"❌ Error generating code: {e}")


# ═══════════════════════════════════════════════════════════════
#  START
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    missing = [k for k in ("DISCORD_TOKEN", "SUPABASE_URL", "SUPABASE_KEY")
               if not os.getenv(k)]
    if missing:
        print(f"ERROR: Missing in .env: {', '.join(missing)}")
        sys.exit(1)

    print("=" * 56)
    print("  StackBet Bot")
    print(f"  API port : {API_PORT}")
    print(f"  Servers  : {', '.join(SERVERS)}")
    print(f"  MC user  : {BOT_MC_NAME}")
    print("=" * 56)
    discord_bot.run(DISCORD_TOKEN)
