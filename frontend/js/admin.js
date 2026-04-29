// ═══════════════════════════════════════════════════════════════
//  admin.js  —  Admin panel (Tab to toggle)
// ═══════════════════════════════════════════════════════════════
const ADMIN_ID = "1068969046780944468";

let _adminPanelOpen = false;
let adminSection    = "players";
let allPlayers      = [];
let selectedPlayer  = null;
let allCodes        = [];

function isAdmin() { const u=sessionGet(); return u&&u.discord_id===ADMIN_ID; }

// ── Build HTML ────────────────────────────────────────────────
function buildAdminHTML() {
  const el = document.createElement("div");
  el.id = "admBackdrop"; el.className = "adm-backdrop";
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
          <button class="adm-close" onclick="adminClose()" title="Close (Tab)">✕</button>
        </div>
        <div class="adm-tabs">
          <button class="adm-tab active" id="tabPlayers"  onclick="adminSwitchSection('players')">Players</button>
          <button class="adm-tab"        id="tabCodes"    onclick="adminSwitchSection('codes')">Codes</button>
          <button class="adm-tab"        id="tabDaycoin"  onclick="adminSwitchSection('daycoin')">DayCoin</button>
        </div>
      </div>
      <div class="adm-body">

        <!-- ── PLAYERS SECTION ── -->
        <div class="adm-section active" id="sectionPlayers">
          <div id="admPlayerList">
            <input class="adm-search" id="admSearch" placeholder="Search by username…" oninput="adminFilterPlayers()"/>
            <div class="adm-player-list" id="admPlayerRows">
              <div class="adm-loading"><div class="adm-spinner"></div>Loading…</div>
            </div>
          </div>
          <div id="admPlayerDetail" style="display:none">
            <button class="adm-back" onclick="adminBackToList()">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <div class="adm-detail-header">
              <div class="adm-detail-av" id="admDetailAv"></div>
              <div>
                <div class="adm-detail-name" id="admDetailName"></div>
                <div class="adm-detail-id"   id="admDetailId"></div>
              </div>
            </div>
            <div class="adm-stat-row">
              <span class="adm-stat-label">CHIPS</span>
              <span class="adm-stat-val" id="admDetailBal"></span>
            </div>
            <div class="adm-stat-row" style="margin-top:6px">
              <span class="adm-stat-label">GOLDEN DICE</span>
              <span class="adm-stat-val" id="admDetailGdice" style="color:#f59e0b"></span>
            </div>
            <div class="adm-set-row" style="margin-top:12px">
              <input class="adm-num-input" id="admNewBal" type="number" min="0" placeholder="New chips…"/>
              <button class="adm-btn-set" onclick="adminSetBalance()">Set Chips</button>
            </div>
            <div class="adm-set-row" style="margin-top:8px">
              <input class="adm-num-input" id="admNewGdice" type="number" min="0" placeholder="New golden dice…"/>
              <button class="adm-btn-set" onclick="adminSetGdice()">Set GDice</button>
            </div>
            <div class="adm-danger-zone">
              <div class="adm-danger-label">DANGER ZONE</div>
              <div class="adm-danger-btns">
                <button class="adm-btn-danger" onclick="adminResetPlayer()">Reset chips to $0</button>
                <button class="adm-btn-danger" onclick="adminResetAll()">⚠️ Reset ALL players</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── CODES SECTION ── -->
        <div class="adm-section" id="sectionCodes">
          <!-- Create code form -->
          <div class="adm-codes-form">
            <div class="adm-form-title">Create Promo Code</div>

            <div class="adm-field">
              <label class="adm-field-lbl">CODE</label>
              <input class="adm-search" id="admNewCode" type="text" placeholder="e.g. STACK or BET100"
                     oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')"/>
            </div>

            <div class="adm-field">
              <label class="adm-field-lbl">GOLDEN DICE REWARD</label>
              <input class="adm-num-input" id="admCodeGdice" type="number" min="1" placeholder="e.g. 100"/>
            </div>

            <div class="adm-field">
              <label class="adm-field-lbl">EXPIRY</label>
              <select class="adm-select" id="admCodeExpiry" onchange="adminExpireChange()">
                <option value="never">Never</option>
                <option value="uses">After N uses</option>
                <option value="date">After date</option>
              </select>
            </div>

            <div class="adm-field" id="admCodeUsesWrap" style="display:none">
              <label class="adm-field-lbl">MAX USES</label>
              <input class="adm-num-input" id="admCodeMaxUses" type="number" min="1" placeholder="e.g. 50"/>
            </div>

            <div class="adm-field" id="admCodeDateWrap" style="display:none">
              <label class="adm-field-lbl">EXPIRES ON</label>
              <input class="adm-num-input" id="admCodeDate" type="datetime-local"/>
            </div>

            <button class="adm-btn-set" style="width:100%;margin-top:6px" onclick="adminCreateCode()">Create Code</button>
          </div>

          <!-- Existing codes list -->
          <div class="adm-form-title" style="margin-top:18px;margin-bottom:8px">Active Codes</div>
          <div id="admCodeRows">
            <div class="adm-loading"><div class="adm-spinner"></div>Loading…</div>
          </div>
        </div>

        <!-- ── DAYCOIN SECTION ── -->
        <div class="adm-section" id="sectionDaycoin">

          <!-- Current price display -->
          <div class="adm-stat-row" id="admDcPriceRow">
            <span class="adm-stat-label">CURRENT DAYCOIN PRICE</span>
            <span class="adm-stat-val" id="admDcPrice" style="font-family:'DM Mono',monospace">$1.0000</span>
          </div>

          <!-- How was your day? -->
          <div class="adm-codes-form" style="margin-bottom:14px">
            <div class="adm-form-title">How was your day?</div>
            <div id="admDcStep1">
              <div style="display:flex;gap:8px;margin-bottom:10px">
                <button class="adm-btn-set"
                  style="flex:1;height:50px;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.4);color:var(--green)"
                  onclick="admDcSelectMood('good')">
                  😊 Good Day
                </button>
                <button class="adm-btn-set"
                  style="flex:1;height:50px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);color:var(--red)"
                  onclick="admDcSelectMood('bad')">
                  😞 Bad Day
                </button>
              </div>
            </div>

            <!-- Step 2: strength slider -->
            <div id="admDcStep2" style="display:none">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <span id="admDcMoodLabel" style="font-size:13px;font-weight:700;color:var(--green)">Good Day</span>
                <button onclick="admDcReset()" style="margin-left:auto;background:none;border:1px solid var(--bdr);border-radius:6px;color:var(--muted);padding:3px 10px;font-size:12px">← Back</button>
              </div>
              <div class="adm-field">
                <label class="adm-field-lbl">Strength (1 = small, 10 = large)</label>
                <div style="display:flex;align-items:center;gap:12px">
                  <input type="range" id="admDcStrength" min="1" max="10" value="5"
                    style="flex:1;accent-color:var(--green)"
                    oninput="admDcUpdateStrengthLabel()"/>
                  <span id="admDcStrengthVal"
                    style="font-family:'DM Mono',monospace;font-size:18px;font-weight:800;color:var(--green);min-width:24px;text-align:right">5</span>
                </div>
              </div>
              <div id="admDcPreviewText" style="font-size:12px;color:var(--muted);margin-bottom:12px;font-family:'DM Mono',monospace"></div>
              <button class="adm-btn-set" style="width:100%;height:46px" onclick="admDcApply()" id="admDcApplyBtn">
                Apply Price Change
              </button>
            </div>
          </div>

          <!-- Danger zone -->
          <div class="adm-danger-zone">
            <div class="adm-danger-label">DANGER ZONE</div>
            <div class="adm-danger-btns">
              <button class="adm-btn-danger" onclick="admDcReset1()">Reset DayCoin to $1.0000</button>
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
  const bd = document.getElementById("admBackdrop"); if (!bd) return;
  bd.classList.add("open"); _adminPanelOpen = true;
  if (adminSection === "players") adminLoadPlayers();
  else adminLoadCodes();
}
function adminClose() {
  const bd = document.getElementById("admBackdrop");
  if (bd) bd.classList.remove("open"); _adminPanelOpen = false;
}
function adminToggle() { if (_adminPanelOpen) adminClose(); else adminOpenPanel(); }

// ── Section tabs ──────────────────────────────────────────────
function adminSwitchSection(name) {
  adminSection = name;
  document.querySelectorAll(".adm-tab").forEach(t=>t.classList.remove("active"));
  document.querySelectorAll(".adm-section").forEach(s=>s.classList.remove("active"));
  const cap = name.charAt(0).toUpperCase()+name.slice(1);
  const tab = document.getElementById("tab"+cap);
  const sec = document.getElementById("section"+cap);
  if (tab) tab.classList.add("active");
  if (sec) sec.classList.add("active");
  if      (name === "players")  adminLoadPlayers();
  else if (name === "codes")    adminLoadCodes();
  else if (name === "daycoin")  admDcLoad();
}

// ── Players ───────────────────────────────────────────────────
async function adminLoadPlayers() {
  const rows = document.getElementById("admPlayerRows"); if (!rows) return;
  rows.innerHTML = '<div class="adm-loading"><div class="adm-spinner"></div>Loading…</div>';
  document.getElementById("admSearch").value = "";
  try {
    allPlayers = await sbGet("users", "?order=balance.desc");
    adminRenderList(allPlayers);
  } catch (e) { rows.innerHTML = `<div class="adm-empty">Error: ${esc(e.message)}</div>`; }
}

function adminRenderList(players) {
  const rows = document.getElementById("admPlayerRows"); if (!rows) return;
  if (!players.length) { rows.innerHTML='<div class="adm-empty">No players.</div>'; return; }
  rows.innerHTML = players.map(p=>`
    <div class="adm-player-row" onclick="adminOpenPlayer('${esc(p.discord_id)}')">
      <div class="adm-player-av">${p.avatar
        ?`<img src="${esc(p.avatar)}" alt="" onerror="this.parentElement.textContent='${esc(p.username.slice(0,2).toUpperCase())}'">` 
        :esc(p.username.slice(0,2).toUpperCase())}</div>
      <span class="adm-player-name">${esc(p.username)}</span>
      <span class="adm-player-bal">$${fmtC(p.balance)}</span>
      <span class="adm-player-arrow">›</span>
    </div>`).join("");
}

function adminFilterPlayers() {
  const q = document.getElementById("admSearch").value.toLowerCase().trim();
  adminRenderList(q ? allPlayers.filter(p=>p.username.toLowerCase().includes(q)) : allPlayers);
}

async function adminOpenPlayer(did) {
  let p = allPlayers.find(x=>x.discord_id===did);
  try { const f=await sbGet("users",`?discord_id=eq.${did}`); if(f.length)p=f[0]; } catch{}
  if (!p) return;
  selectedPlayer = p;
  const av = document.getElementById("admDetailAv");
  if (p.avatar) { av.innerHTML=`<img src="${esc(p.avatar)}" alt="" onerror="this.parentElement.textContent='${esc(p.username.slice(0,2).toUpperCase())}'">`; }
  else          { av.textContent=p.username.slice(0,2).toUpperCase(); }
  document.getElementById("admDetailName").textContent = p.username;
  document.getElementById("admDetailId").textContent   = "ID: "+p.discord_id;
  document.getElementById("admDetailBal").textContent  = "$"+fmtC(p.balance);
  document.getElementById("admDetailGdice").textContent= fmtC(p.gdice||0)+" 🎲";
  document.getElementById("admNewBal").value   = "";
  document.getElementById("admNewGdice").value = "";
  document.getElementById("admPlayerList").style.display   = "none";
  document.getElementById("admPlayerDetail").style.display = "block";
}

function adminBackToList() {
  selectedPlayer=null;
  document.getElementById("admPlayerDetail").style.display="none";
  document.getElementById("admPlayerList").style.display="block";
  adminLoadPlayers();
}

async function adminSetBalance() {
  if (!selectedPlayer) return;
  const v=parseFloat(document.getElementById("admNewBal").value);
  if (isNaN(v)||v<0){ adminToast("Enter a valid amount.","warn"); return; }
  const btn=document.querySelector(".adm-btn-set"); btn.textContent="Saving…"; btn.disabled=true;
  try {
    await sbPatch("users",`?discord_id=eq.${selectedPlayer.discord_id}`,{balance:parseFloat(v.toFixed(4))});
    selectedPlayer.balance=v;
    document.getElementById("admDetailBal").textContent="$"+fmtC(v);
    document.getElementById("admNewBal").value="";
    const me=sessionGet();
    if (me&&me.discord_id===selectedPlayer.discord_id){ sessionSetBalance(v); refreshBalance(); }
    adminToast("Chips set to "+fmtC(v),"ok");
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
  finally { btn.textContent="Set Chips"; btn.disabled=false; }
}

async function adminSetGdice() {
  if (!selectedPlayer) return;
  const v=parseFloat(document.getElementById("admNewGdice").value);
  if (isNaN(v)||v<0){ adminToast("Enter a valid amount.","warn"); return; }
  try {
    await sbPatch("users",`?discord_id=eq.${selectedPlayer.discord_id}`,{gdice:parseFloat(v.toFixed(4))});
    selectedPlayer.gdice=v;
    document.getElementById("admDetailGdice").textContent=fmtC(v)+" 🎲";
    document.getElementById("admNewGdice").value="";
    const me=sessionGet();
    if (me&&me.discord_id===selectedPlayer.discord_id){ sessionSetGdice(v); refreshBalance(); }
    adminToast("Golden Dice set to "+fmtC(v),"ok");
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
}

async function adminResetPlayer() {
  if (!selectedPlayer||!confirm("Reset "+selectedPlayer.username+"'s chips to $0?")) return;
  try {
    await sbPatch("users",`?discord_id=eq.${selectedPlayer.discord_id}`,{balance:0});
    selectedPlayer.balance=0;
    document.getElementById("admDetailBal").textContent="$0";
    const me=sessionGet();
    if (me&&me.discord_id===selectedPlayer.discord_id){ sessionSetBalance(0); refreshBalance(); }
    adminToast(selectedPlayer.username+" reset to $0","ok");
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
}

async function adminResetAll() {
  if (!confirm("⚠️ Reset ALL players to $0 and delete ALL bet history?\n\nThis cannot be undone.")) return;
  if (!confirm("Are you absolutely sure?")) return;
  try {
    await sbPatch("users","",{balance:0});
    await sbDelete("bets","?id=gte.0");
    const me=sessionGet(); if(me){ sessionSetBalance(0); refreshBalance(); }
    adminToast("All data reset.","ok"); adminBackToList();
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
}

// ── Codes section ─────────────────────────────────────────────
function adminExpireChange() {
  const val = document.getElementById("admCodeExpiry").value;
  document.getElementById("admCodeUsesWrap").style.display = val==="uses" ? "block" : "none";
  document.getElementById("admCodeDateWrap").style.display = val==="date" ? "block" : "none";
}

async function adminCreateCode() {
  const code       = document.getElementById("admNewCode").value.trim().toUpperCase();
  const gdice      = parseFloat(document.getElementById("admCodeGdice").value);
  const expType    = document.getElementById("admCodeExpiry").value;
  const maxUses    = parseInt(document.getElementById("admCodeMaxUses").value) || null;
  const dateVal    = document.getElementById("admCodeDate").value;

  if (!code)               { adminToast("Enter a code name.","warn"); return; }
  if (!gdice||gdice<=0)    { adminToast("Enter a valid Golden Dice amount.","warn"); return; }
  if (expType==="uses"&&(!maxUses||maxUses<1)) { adminToast("Enter max uses.","warn"); return; }
  if (expType==="date"&&!dateVal)              { adminToast("Pick an expiry date.","warn"); return; }

  const body = {
    code,
    gdice_amount: gdice,
    expires_type: expType,
    expires_at:   expType==="date" ? Math.floor(new Date(dateVal).getTime()/1000) : null,
    max_uses:     expType==="uses" ? maxUses : null,
    uses:         0,
  };

  try {
    await sbPost("promo_codes", body);
    adminToast("Code "+code+" created!","ok");
    document.getElementById("admNewCode").value="";
    document.getElementById("admCodeGdice").value="";
    document.getElementById("admCodeMaxUses").value="";
    document.getElementById("admCodeDate").value="";
    adminLoadCodes();
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
}

async function adminLoadCodes() {
  const el=document.getElementById("admCodeRows"); if(!el) return;
  el.innerHTML='<div class="adm-loading"><div class="adm-spinner"></div>Loading…</div>';
  try {
    allCodes = await sbGet("promo_codes","?order=created_at.desc");
    adminRenderCodes(allCodes);
  } catch(e){ el.innerHTML=`<div class="adm-empty">Error: ${esc(e.message)}</div>`; }
}

function adminRenderCodes(codes) {
  const el=document.getElementById("admCodeRows"); if(!el) return;
  if (!codes.length){ el.innerHTML='<div class="adm-empty">No codes yet.</div>'; return; }
  const now=Math.floor(Date.now()/1000);
  el.innerHTML=codes.map(c=>{
    let expiry="Never";
    let expired=false;
    if (c.expires_type==="date"&&c.expires_at){
      const d=new Date(c.expires_at*1000);
      expiry=d.toLocaleDateString();
      if (now>c.expires_at) expired=true;
    } else if (c.expires_type==="uses"&&c.max_uses){
      expiry=`${c.uses}/${c.max_uses} uses`;
      if (c.uses>=c.max_uses) expired=true;
    }
    return `
      <div class="adm-code-row ${expired?'adm-code-expired':''}">
        <div class="adm-code-main">
          <span class="adm-code-name">${esc(c.code)}</span>
          <span class="adm-code-reward">🎲 +${fmtC(c.gdice_amount)}</span>
        </div>
        <div class="adm-code-meta">
          <span>${expiry}</span>
          <button class="adm-code-del" onclick="adminDeleteCode('${esc(c.code)}')">✕</button>
        </div>
      </div>`;
  }).join("");
}

async function adminDeleteCode(code) {
  if (!confirm("Delete code "+code+"?")) return;
  try {
    await sbDelete("promo_codes",`?code=eq.${code}`);
    adminToast("Code "+code+" deleted.","ok");
    adminLoadCodes();
  } catch(e){ adminToast("Error: "+e.message,"warn"); }
}

// ── Toast / keyboard ──────────────────────────────────────────
function adminToast(msg,type){ toast(msg, type==="ok"?"win":"lose"); }

function adminKeyListener(e) {
  if (e.key==="Tab"&&!["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)){
    e.preventDefault(); adminToggle();
  }
}

function adminShowHint() {
  const h=document.createElement("div"); h.className="adm-hint";
  h.innerHTML="Admin mode — <kbd>Tab</kbd> to open";
  document.body.appendChild(h); setTimeout(()=>h.remove(),4500);
}

function adminInit() {
  if (!isAdmin()) return;
  buildAdminHTML();
  document.addEventListener("keydown",adminKeyListener);
  adminShowHint();
}

// ═══════════════════════════════════════════════════════════════
//  ADMIN — DayCoin section
// ═══════════════════════════════════════════════════════════════
let _admDcMood = null; // "good" | "bad"

async function admDcLoad() {
  try {
    const rows = await sbGet("daycoin_state","?id=eq.1");
    const price = rows.length ? parseFloat(rows[0].price) : 1.0;
    const el = document.getElementById("admDcPrice");
    if (el) el.textContent = "$" + price.toFixed(4);
  } catch(e) { adminToast("Could not load DayCoin price.","warn"); }
  admDcReset();
}

function admDcSelectMood(mood) {
  _admDcMood = mood;
  const label   = document.getElementById("admDcMoodLabel");
  const preview = document.getElementById("admDcPreviewText");
  if (label) {
    label.textContent = mood === "good" ? "😊 Good Day" : "😞 Bad Day";
    label.style.color = mood === "good" ? "var(--green)" : "var(--red)";
  }
  document.getElementById("admDcStep1").style.display = "none";
  document.getElementById("admDcStep2").style.display = "block";
  admDcUpdateStrengthLabel();
}

function admDcUpdateStrengthLabel() {
  const strength = parseInt(document.getElementById("admDcStrength")?.value || 5);
  const el       = document.getElementById("admDcStrengthVal");
  if (el) el.textContent = strength;

  // Preview: strength 1 = 2%, strength 10 = 25%
  const pct      = strength * 2.5;
  const preview  = document.getElementById("admDcPreviewText");
  if (preview) {
    const dir = _admDcMood === "good" ? `+${pct.toFixed(1)}%` : `-${pct.toFixed(1)}%`;
    preview.textContent = `Price will change by approximately ${dir}`;
    preview.style.color = _admDcMood === "good" ? "var(--green)" : "var(--red)";
  }
}

async function admDcApply() {
  if (!_admDcMood) return;
  const strength = parseInt(document.getElementById("admDcStrength")?.value || 5);
  const btn      = document.getElementById("admDcApplyBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Applying…"; }

  try {
    // Load current price
    const rows     = await sbGet("daycoin_state","?id=eq.1");
    const curPrice = rows.length ? parseFloat(rows[0].price) : 1.0;

    // Linear change: strength 1 = 2.5%, strength 10 = 25%
    const pct      = strength * 0.025;
    const delta    = _admDcMood === "good" ? curPrice * pct : -(curPrice * pct);
    const newPrice = parseFloat(Math.max(0.0001, curPrice + delta).toFixed(4));
    const now      = Math.floor(Date.now()/1000);
    const note     = `Admin: ${_admDcMood === "good" ? "Good" : "Bad"} day (strength ${strength})`;

    // Update state
    await sbPatch("daycoin_state","?id=eq.1",{ price: newPrice, updated_at: now });

    // Record history
    await sbPost("daycoin_history",{ price: newPrice, note, created_at: now });

    // Update UI
    const priceEl = document.getElementById("admDcPrice");
    if (priceEl) priceEl.textContent = "$" + newPrice.toFixed(4);

    adminToast(
      `DayCoin → $${newPrice.toFixed(4)} (${_admDcMood === "good" ? "+" : "-"}${(strength*2.5).toFixed(1)}%)`,
      "ok"
    );
    admDcReset();
  } catch(e) {
    adminToast("Error: "+e.message,"warn");
  }
  if (btn) { btn.disabled = false; btn.textContent = "Apply Price Change"; }
}

async function admDcReset1() {
  if (!confirm("Reset DayCoin to $1.0000 and clear history?")) return;
  try {
    const now = Math.floor(Date.now()/1000);
    await sbPatch("daycoin_state","?id=eq.1",{ price: 1.0, updated_at: now });
    // Delete history and reinsert the reset point
    await sbDelete("daycoin_history","?id=gte.0");
    await sbPost("daycoin_history",{ price: 1.0, note: "Admin: Price reset to $1.0000", created_at: now });
    const priceEl = document.getElementById("admDcPrice");
    if (priceEl) priceEl.textContent = "$1.0000";
    adminToast("DayCoin reset to $1.0000","ok");
  } catch(e) { adminToast("Error: "+e.message,"warn"); }
}

function admDcReset() {
  _admDcMood = null;
  const s1 = document.getElementById("admDcStep1");
  const s2 = document.getElementById("admDcStep2");
  if (s1) s1.style.display = "block";
  if (s2) s2.style.display = "none";
  const inp = document.getElementById("admDcStrength");
  if (inp) inp.value = 5;
  const lbl = document.getElementById("admDcStrengthVal");
  if (lbl) lbl.textContent = "5";
}
