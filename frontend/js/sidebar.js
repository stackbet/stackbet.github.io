// ─────────────────────────────────────────────────────────────
//  sidebar.js  —  Collapsible sidebar controlled by hamburger
//
//  - Starts COLLAPSED on every fresh page load / refresh
//  - Clicking the hamburger toggles expanded ↔ collapsed
//  - The collapsed/expanded state is remembered within the
//    same browser session (sessionStorage), so navigating
//    between pages keeps the last state the user chose
//  - Collapsed = icons only (with hover tooltips)
//  - Expanded  = icons + text labels
// ─────────────────────────────────────────────────────────────

const SB_STATE_KEY = "sb_sidebar_open";

function setSidebarState(open) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  if (open) {
    sidebar.classList.remove("collapsed");
    document.body.classList.remove("sb-collapsed");
    sessionStorage.setItem(SB_STATE_KEY, "1");
  } else {
    sidebar.classList.add("collapsed");
    document.body.classList.add("sb-collapsed");
    sessionStorage.setItem(SB_STATE_KEY, "0");
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  const isOpen = !sidebar.classList.contains("collapsed");
  setSidebarState(!isOpen); // flip it
}

// On every page load: default to COLLAPSED unless the user
// explicitly opened it during this session.
document.addEventListener("DOMContentLoaded", () => {
  const savedState = sessionStorage.getItem(SB_STATE_KEY);
  // "1" means user opened it; anything else (null, "0") = collapsed
  const shouldBeOpen = savedState === "1";
  setSidebarState(shouldBeOpen);
});
