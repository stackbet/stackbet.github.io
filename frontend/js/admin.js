// ═══════════════════════════════════════════════════════════════
//  admin.js  —  Admin cheat-menu overlay
//  Shortcut: Ctrl + ` (backtick) to open/close
// ═══════════════════════════════════════════════════════════════

const ADMIN_ID = "1068969046780944468"; // .vrvr

// ── State ─────────────────────────────────────────────────────
// NOTE: Using _adminPanelOpen to avoid collision with any function named adminOpen
let _adminPanelOpen = false;
let adminSection    = "players";
let allPlayers      = [];
let selectedPlayer  = null;

function isAdmin() {
  const u = sessionGet();
  return u && u.discord_id === ADMIN_ID;
}

// ── Build overlay HTML ────────────────────────────────────────
function buildAdminHTML() {
  const el = document.createElement("div");
  el.id = "admBackdrop";
  el.className = "adm-backdrop";
  el.innerHTML = `
    <div class="adm-panel" id="admPanel">
      <div class="adm-header">
        <div class="adm-title-row">
          <div class="adm-title">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Admin Panel
          </div>
          <button class="adm-close" onclick="adminClose()" title="Close (Ctrl+\`)">✕</button>
        </div>
        <div class="adm-tabs">
          <button class="adm-tab active" id="tabPlayers" onclick="adminSwitchSection('players')">Players</button>
        </div>
      </div>
      <div class="adm-body">
        <div class="adm-section active" id="sectionPlayers">
          <div id="admPlayerList">
            <input class="adm-search" id="admSearch" placeholder="Search by username…" oninput="adminFilterPlayers()"/>
            <div class="adm-player-list" id="admPlayerRows">
              <div class="adm-loading"><div class="adm-spinner"></div>Loading players…</div>
            </div>
          </div>
          <div id="admPlayerDetail" style="display:none">
            <button class="adm-back" onclick="adminBackToList()">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
              Back to players
            </button>
            <div class="adm-detail-header">
              <div class="adm-detail-av" id="admDetailAv"></div>
              <div>
                <div class="adm-detail-name" id="admDetailName"></div>
                <div class="adm-detail-id"   id="admDetailId"></div>
              </div>
            </div>
            <div class="adm-stat-row">
              <span class="adm-stat-label">CURRENT BALANCE</span>
              <span class="adm-stat-val" id="admDetailBal"></span>
            </div>
            <div class="adm-set-row">
              <input class="adm-num-input" id="admNewBal" type="number" min="0" placeholder="New balance…"/>
              <button class="adm-btn-set" onclick="adminSetBalance()">Set Balance</button>
            </div>
            <div class="adm-danger-zone">
              <div class="adm-danger-label">DANGER ZONE</div>
              <div class="adm-danger-btns">
                <button class="adm-btn-danger" onclick="adminResetPlayer()">Reset this player's balance to $0</button>
                <button class="adm-btn-danger" onclick="adminResetAll()">⚠️ Reset ALL players and data</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  el.addEventListener("click", e => { if (e.target === el) adminClose(); });
}

// ── Open / Close / Toggle ─────────────────────────────────────
function adminOpenPanel() {
  if (!isAdmin()) return;
  const bd = document.getElementById("admBackdrop");
  if (!bd) return;
  bd.classList.add("open");
  _adminPanelOpen = true;
  adminLoadPlayers();
}

function adminClose() {
  const bd = document.getElementById("admBackdrop");
  if (bd) bd.classList.remove("open");
  _adminPanelOpen = false;
}

function adminToggle() {
  if (_adminPanelOpen) adminClose();
  else adminOpenPanel();
}

// ── Sections ──────────────────────────────────────────────────
function adminSwitchSection(name) {
  adminSection = name;
  document.querySelectorAll(".adm-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".adm-section").forEach(s => s.classList.remove("active"));
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const tab = document.getElementById("tab" + cap);
  const sec = document.getElementById("section" + cap);
  if (tab) tab.classList.add("active");
  if (sec) sec.classList.add("active");
}

// ── Player list ───────────────────────────────────────────────
async function adminLoadPlayers() {
  const rows = document.getElementById("admPlayerRows");
  if (!rows) return;
  rows.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div>Loading…</div>';
  document.getElementById("admSearch").value = "";
  try {
    allPlayers = await sbGet("users", "?order=balance.desc");
    adminRenderList(allPlayers);
  } catch (e) {
    rows.innerHTML = `<div class="adm-empty">Error: ${esc(e.message)}</div>`;
  }
}

function adminRenderList(players) {
  const rows = document.getElementById("admPlayerRows");
  if (!rows) return;
  if (!players.length) { rows.innerHTML = '<div class="adm-empty">No players found.</div>'; return; }
  rows.innerHTML = players.map(p => `
    <div class="adm-player-row" onclick="adminOpenPlayer('${esc(p.discord_id)}')">
      <div class="adm-player-av">
        ${p.avatar
          ? `<img src="${esc(p.avatar)}" alt="" onerror="this.parentElement.textContent='${esc(p.username.slice(0,2).toUpperCase())}'">`
          : esc(p.username.slice(0,2).toUpperCase())}
      </div>
      <span class="adm-player-name">${esc(p.username)}</span>
      <span class="adm-player-bal">$${parseFloat(p.balance).toFixed(2)}</span>
      <span class="adm-player-arrow">›</span>
    </div>`).join("");
}

function adminFilterPlayers() {
  const q = document.getElementById("admSearch").value.toLowerCase().trim();
  adminRenderList(q ? allPlayers.filter(p => p.username.toLowerCase().includes(q)) : allPlayers);
}

// ── Player detail ─────────────────────────────────────────────
async function adminOpenPlayer(discordId) {
  let p = allPlayers.find(x => x.discord_id === discordId);
  try {
    const fresh = await sbGet("users", `?discord_id=eq.${discordId}`);
    if (fresh.length) p = fresh[0];
  } catch {}
  if (!p) return;
  selectedPlayer = p;

  const av = document.getElementById("admDetailAv");
  if (p.avatar) {
    av.innerHTML = `<img src="${esc(p.avatar)}" alt="" onerror="this.parentElement.textContent='${esc(p.username.slice(0,2).toUpperCase())}'">`; 
  } else {
    av.textContent = p.username.slice(0,2).toUpperCase();
  }
  document.getElementById("admDetailName").textContent = p.username;
  document.getElementById("admDetailId").textContent   = "ID: " + p.discord_id;
  document.getElementById("admDetailBal").textContent  = "$" + parseFloat(p.balance).toFixed(2);
  document.getElementById("admNewBal").value           = "";
  document.getElementById("admPlayerList").style.display   = "none";
  document.getElementById("admPlayerDetail").style.display = "block";
}

function adminBackToList() {
  selectedPlayer = null;
  document.getElementById("admPlayerDetail").style.display = "none";
  document.getElementById("admPlayerList").style.display   = "block";
  adminLoadPlayers();
}

// ── Actions ───────────────────────────────────────────────────
async function adminSetBalance() {
  if (!selectedPlayer) return;
  const raw = parseFloat(document.getElementById("admNewBal").value);
  if (isNaN(raw) || raw < 0) { adminToast("Enter a valid amount (0 or more).", "warn"); return; }
  const val = parseFloat(raw.toFixed(2));
  const btn = document.querySelector(".adm-btn-set");
  btn.textContent = "Saving…"; btn.disabled = true;
  try {
    await sbPatch("users", `?discord_id=eq.${selectedPlayer.discord_id}`, { balance: val });
    selectedPlayer.balance = val;
    document.getElementById("admDetailBal").textContent = "$" + val.toFixed(2);
    document.getElementById("admNewBal").value = "";
    const me = sessionGet();
    if (me && me.discord_id === selectedPlayer.discord_id) { sessionSetBalance(val); refreshBalance(); }
    adminToast("Balance set to $" + val.toFixed(2), "ok");
  } catch (e) {
    adminToast("Error: " + e.message, "warn");
  } finally {
    btn.textContent = "Set Balance"; btn.disabled = false;
  }
}

async function adminResetPlayer() {
  if (!selectedPlayer) return;
  if (!confirm("Reset " + selectedPlayer.username + "'s balance to $0?")) return;
  try {
    await sbPatch("users", `?discord_id=eq.${selectedPlayer.discord_id}`, { balance: 0 });
    selectedPlayer.balance = 0;
    document.getElementById("admDetailBal").textContent = "$0.00";
    const me = sessionGet();
    if (me && me.discord_id === selectedPlayer.discord_id) { sessionSetBalance(0); refreshBalance(); }
    adminToast(selectedPlayer.username + " reset to $0", "ok");
  } catch (e) {
    adminToast("Error: " + e.message, "warn");
  }
}

async function adminResetAll() {
  if (!confirm("⚠️ This will reset ALL players to $0 and delete ALL bet history.\n\nThis cannot be undone. Are you sure?")) return;
  if (!confirm("Are you absolutely sure? ALL data will be wiped.")) return;
  try {
    await sbPatch("users", "", { balance: 0 });
    await sbDelete("bets", "?id=gte.0");
    const me = sessionGet();
    if (me) { sessionSetBalance(0); refreshBalance(); }
    adminToast("All data reset.", "ok");
    adminBackToList();
  } catch (e) {
    adminToast("Error: " + e.message, "warn");
  }
}

function adminToast(msg, type) {
  toast(msg, type === "ok" ? "win" : "lose");
}

// ── Keyboard: Tab ────────────────────────────────────────────
function adminKeyListener(e) {
  // Tab key — but only when NOT in an input/textarea
  if (e.key === "Tab" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    adminToggle();
  }
}

function adminShowHint() {
  const hint = document.createElement("div");
  hint.className = "adm-hint";
  hint.innerHTML = "Admin mode — <kbd>Tab</kbd> to open panel";
  document.body.appendChild(hint);
  setTimeout(() => hint.remove(), 4500);
}

function adminInit() {
  if (!isAdmin()) return;
  buildAdminHTML();
  document.addEventListener("keydown", adminKeyListener);
  adminShowHint();
}
