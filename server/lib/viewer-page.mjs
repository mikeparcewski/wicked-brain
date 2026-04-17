/**
 * Read-only HTML viewer for a wicked-brain instance.
 *
 * Single self-contained page — no framework, no build, no new dependencies.
 * Styled after Material Design: AppBar, Drawer, Cards, Chips, elevation.
 * Calls the server's existing `POST /api` endpoint for data.
 *
 * The returned HTML embeds the brain id for display; everything else is
 * dynamic via fetch at runtime.
 */

export function renderViewerHtml({ brainId = "brain" } = {}) {
  const safeBrainId = String(brainId).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeBrainId} · wicked-brain</title>
  <style>${STYLES}</style>
</head>
<body>
  <header class="app-bar">
    <div class="app-bar-inner">
      <div class="app-title">
        <span class="app-icon">&#9788;</span>
        <span class="app-title-text">${safeBrainId}</span>
      </div>
      <div class="app-bar-spacer"></div>
      <div id="stats-chip" class="chip chip-outline" title="Indexed documents"><span id="stats-text">loading…</span></div>
      <button id="btn-reonboard" class="app-bar-btn" type="button" title="Re-run onboarding (re-detect mode, re-index from disk)" aria-label="Re-run onboarding">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
      </button>
      <button id="btn-purge" class="app-bar-btn app-bar-btn-danger" type="button" title="Delete all content in this brain" aria-label="Delete all content">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>
  </header>
  <div id="snack" class="snack" role="status" aria-live="polite"></div>
  <div class="tabs" role="tablist">
    <button type="button" class="tab active" role="tab" aria-selected="true" data-tab="search">Search</button>
    <button type="button" class="tab" role="tab" aria-selected="false" data-tab="wiki">Wiki</button>
  </div>
  <main class="content" id="content">
    <section id="search-tab" class="tab-panel" role="tabpanel" aria-labelledby="Search">
      <div class="content-toolbar">
        <form id="search-form" class="search-field" role="search">
          <svg viewBox="0 0 24 24" class="search-icon" aria-hidden="true"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input id="search-input" type="search" placeholder="Search the brain…" autocomplete="off" spellcheck="false">
          <button type="button" id="clear-btn" class="clear-btn" aria-label="Clear">&times;</button>
        </form>
        <ul class="filter-list" id="type-filters">
          <li><label class="filter-row"><input type="checkbox" data-type="wiki" checked> <span class="chip chip-wiki">wiki</span></label></li>
          <li><label class="filter-row"><input type="checkbox" data-type="chunk" checked> <span class="chip chip-chunk">chunk</span></label></li>
          <li><label class="filter-row"><input type="checkbox" data-type="memory" checked> <span class="chip chip-memory">memory</span></label></li>
        </ul>
      </div>
      <div id="results-list" class="results-list"></div>
      <div id="results-empty" class="empty-state hidden">
        <div class="empty-icon">&#9740;</div>
        <div class="empty-text">Nothing to show yet.</div>
      </div>
      <div id="results-meta" class="results-footer"></div>
    </section>
    <section id="wiki-tab" class="tab-panel hidden" role="tabpanel" aria-labelledby="Wiki">
      <div class="wiki-header">
        <div class="wiki-title">Wiki articles</div>
        <div class="wiki-count" id="wiki-count"></div>
      </div>
      <div id="wiki-cards" class="wiki-cards"><div class="muted">loading…</div></div>
    </section>
    <section id="doc-view" class="tab-panel hidden">
      <div class="view-header">
        <button id="back-btn" class="icon-btn" aria-label="Back">&#8592;</button>
        <div class="view-title" id="doc-title">Document</div>
        <div class="view-meta" id="doc-meta"></div>
      </div>
      <div id="doc-chips" class="doc-chips"></div>
      <article id="doc-body" class="doc-body"></article>
    </section>
  </main>
  <script>${CLIENT_JS}</script>
</body>
</html>
`;
}

// --- Styles (Material-inspired, hand-rolled — no external CSS) ---

const STYLES = `
:root {
  --primary: #1976d2;
  --primary-dark: #115293;
  --primary-contrast: #ffffff;
  --surface: #ffffff;
  --bg: #f5f5f5;
  --divider: rgba(0,0,0,0.12);
  --text-primary: rgba(0,0,0,0.87);
  --text-secondary: rgba(0,0,0,0.6);
  --text-disabled: rgba(0,0,0,0.38);
  --hover: rgba(0,0,0,0.04);
  --selected: rgba(25,118,210,0.08);
  --chip-wiki-bg: #e3f2fd;
  --chip-wiki-fg: #0d47a1;
  --chip-chunk-bg: #f3e5f5;
  --chip-chunk-fg: #4a148c;
  --chip-memory-bg: #fff3e0;
  --chip-memory-fg: #e65100;
  --chip-canonical-bg: #e8f5e9;
  --chip-canonical-fg: #1b5e20;
  --elev-1: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
  --elev-2: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
  --app-bar-h: 56px;
  --drawer-w: 300px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg);
}

/* AppBar */
.app-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: var(--app-bar-h);
  background: var(--primary);
  color: var(--primary-contrast);
  box-shadow: var(--elev-2);
  z-index: 10;
}
.app-bar-inner {
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}
.app-title { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.app-icon { font-size: 20px; }
.app-title-text { font-size: 18px; font-weight: 500; letter-spacing: 0.15px; }
.app-bar-spacer { flex: 1; }

/* Main-content toolbar (search + filters) */
.content-toolbar {
  padding: 16px 0 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.search-field {
  flex: 1 1 320px;
  min-width: 240px;
  display: flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: 4px;
  padding: 0 8px 0 12px;
  height: 40px;
  transition: border-color 120ms, box-shadow 120ms;
}
.search-field:hover { border-color: rgba(0,0,0,0.3); }
.search-field:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}
.search-icon { width: 20px; height: 20px; fill: var(--text-secondary); margin-right: 8px; }
#search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font: inherit;
  padding: 8px 0;
}
#search-input::placeholder { color: var(--text-disabled); }
.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 50%;
  opacity: 0.6;
  visibility: hidden;
}
.clear-btn:hover { opacity: 1; background: var(--hover); }
.search-field.has-value .clear-btn { visibility: visible; }

/* Chip */
.chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.3px;
  white-space: nowrap;
  background: rgba(0,0,0,0.08);
  color: var(--text-primary);
}
.chip-outline {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.5);
  color: rgba(255,255,255,0.95);
}
.chip-wiki    { background: var(--chip-wiki-bg);    color: var(--chip-wiki-fg); }
.chip-chunk   { background: var(--chip-chunk-bg);   color: var(--chip-chunk-fg); }
.chip-memory  { background: var(--chip-memory-bg);  color: var(--chip-memory-fg); }
.chip-canonical { background: var(--chip-canonical-bg); color: var(--chip-canonical-fg); }

/* Layout (full-width single column, no drawer) */
.content {
  padding: 16px 32px 48px;
  max-width: 960px;
  margin: 0 auto;
}

/* Tabs (MUI-style) */
.tabs {
  position: fixed;
  top: var(--app-bar-h);
  left: 0;
  right: 0;
  height: 48px;
  background: var(--surface);
  border-bottom: 1px solid var(--divider);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  display: flex;
  justify-content: center;
  gap: 8px;
  z-index: 9;
  padding: 0 16px;
}
.tab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 0 20px;
  height: 48px;
  min-width: 120px;
  cursor: pointer;
  transition: color 120ms, border-color 120ms, background 120ms;
}
.tab:hover { background: var(--hover); color: var(--text-primary); }
.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
body { padding-top: calc(var(--app-bar-h) + 48px); }

/* Filters (inline chip row at the top of Search tab) */
.filter-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.filter-list li { margin: 0; }
.filter-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 16px;
  transition: background 120ms;
}
.filter-row:hover { background: var(--hover); }
.filter-row input { accent-color: var(--primary); margin: 0; }

/* Wiki cards (Wiki tab) */
.wiki-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 16px 0 20px;
}
.wiki-title { font-size: 20px; font-weight: 500; color: var(--text-primary); }
.wiki-count { color: var(--text-secondary); font-size: 13px; }
.wiki-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.wiki-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: var(--elev-1);
  cursor: pointer;
  transition: box-shadow 120ms, transform 120ms;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wiki-card:hover { box-shadow: var(--elev-2); }
.wiki-card:active { transform: translateY(1px); }
.wiki-card-title { font-weight: 500; font-size: 15px; color: var(--text-primary); }
.wiki-card-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.wiki-card-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.wiki-card-path {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-disabled);
  word-break: break-all;
}

/* Tab panels */
.tab-panel { animation: fade 160ms ease; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

.results-footer { color: var(--text-secondary); font-size: 13px; margin-top: 16px; }

/* Main view */
.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.view-title {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  flex: 1;
  word-break: break-word;
}
.view-meta { color: var(--text-secondary); font-size: 13px; }
.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  width: 36px; height: 36px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms;
}
.icon-btn:hover { background: var(--hover); }

.results-list { display: flex; flex-direction: column; gap: 12px; }
.result-card {
  background: var(--surface);
  border-radius: 8px;
  padding: 16px 20px;
  box-shadow: var(--elev-1);
  cursor: pointer;
  transition: box-shadow 120ms, transform 120ms;
}
.result-card:hover { box-shadow: var(--elev-2); }
.result-card:active { transform: translateY(1px); }
.result-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.result-path {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  flex: 1;
  word-break: break-all;
}
.result-score {
  color: var(--text-disabled);
  font-size: 11px;
  font-family: monospace;
}
.result-snippet {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 0;
  line-height: 1.55;
}
.result-snippet b { background: #fff59d; color: var(--text-primary); padding: 0 2px; border-radius: 2px; }
.result-also { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--divider); font-size: 12px; color: var(--text-secondary); }
.result-also-label { font-weight: 500; color: var(--text-primary); margin-right: 6px; }
.result-also-item { margin-right: 10px; font-family: monospace; }

/* Doc view */
.doc-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.doc-body {
  background: var(--surface);
  border-radius: 8px;
  padding: 32px 40px;
  box-shadow: var(--elev-1);
  font-size: 15px;
  line-height: 1.7;
}
.doc-body h1, .doc-body h2, .doc-body h3, .doc-body h4 {
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.3;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
}
.doc-body h1 { font-size: 24px; }
.doc-body h2 { font-size: 20px; border-bottom: 1px solid var(--divider); padding-bottom: 6px; }
.doc-body h3 { font-size: 17px; }
.doc-body h4 { font-size: 15px; color: var(--text-secondary); }
.doc-body p { margin: 0 0 1em; }
.doc-body ul, .doc-body ol { padding-left: 1.4em; margin: 0 0 1em; }
.doc-body li { margin: 0.25em 0; }
.doc-body code {
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: rgba(0,0,0,0.05);
  padding: 1px 5px;
  border-radius: 3px;
}
.doc-body pre {
  background: #263238;
  color: #eceff1;
  padding: 14px 18px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.55;
  margin: 0 0 1em;
}
.doc-body pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
.doc-body a { color: var(--primary); text-decoration: none; }
.doc-body a:hover { text-decoration: underline; }
.doc-body blockquote {
  border-left: 4px solid var(--primary);
  padding: 6px 16px;
  color: var(--text-secondary);
  margin: 0 0 1em;
  background: rgba(25,118,210,0.04);
}
.doc-body table { border-collapse: collapse; margin: 0 0 1em; display: block; overflow-x: auto; }
.doc-body th, .doc-body td { border: 1px solid var(--divider); padding: 6px 10px; text-align: left; font-size: 13px; }
.doc-body th { background: #fafafa; font-weight: 500; }
.doc-body hr { border: none; border-top: 1px solid var(--divider); margin: 2em 0; }

/* State */
.empty-state {
  padding: 64px 16px;
  text-align: center;
  color: var(--text-secondary);
}
.empty-icon { font-size: 48px; color: var(--text-disabled); margin-bottom: 12px; }
.empty-text { font-size: 15px; }
.muted { color: var(--text-secondary); padding: 8px 16px; font-size: 13px; }
.hidden { display: none !important; }

/* App-bar action buttons */
.app-bar-btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--primary-contrast);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms, opacity 120ms;
}
.app-bar-btn svg { width: 22px; height: 22px; fill: currentColor; }
.app-bar-btn:hover:not(:disabled) { background: rgba(255,255,255,0.15); }
.app-bar-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.app-bar-btn-danger:hover:not(:disabled) { background: rgba(255,82,82,0.25); color: #ffcdd2; }

/* Snackbar (MUI-style transient status) */
.snack {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translate(-50%, 40px);
  min-width: 280px;
  max-width: 560px;
  padding: 12px 20px;
  border-radius: 4px;
  background: #323232;
  color: #ffffff;
  font-size: 14px;
  line-height: 1.45;
  box-shadow: var(--elev-2);
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms, transform 160ms;
  z-index: 20;
}
.snack.visible {
  opacity: 1;
  transform: translate(-50%, 0);
  pointer-events: auto;
}
.snack.ok { background: #2e7d32; }
.snack.err { background: #c62828; }

/* Responsive */
@media (max-width: 760px) {
  .content { padding: 8px 16px 48px; }
  .content-toolbar { padding: 12px 0 12px; }
  .app-bar-inner { gap: 8px; }
  #stats-chip { display: none; }
  .tab { min-width: 0; padding: 0 14px; }
}
`;

// --- Client-side JS (vanilla, embedded) ---

const CLIENT_JS = `
(() => {
  const API = "/api";
  const $ = (id) => document.getElementById(id);

  const searchInput = $("search-input");
  const searchForm = $("search-form");
  const clearBtn = $("clear-btn");
  const searchField = searchForm;
  const statsText = $("stats-text");
  const searchTab = $("search-tab");
  const wikiTab = $("wiki-tab");
  const resultsList = $("results-list");
  const resultsMeta = $("results-meta");
  const resultsEmpty = $("results-empty");
  const wikiCards = $("wiki-cards");
  const wikiCount = $("wiki-count");
  const docView = $("doc-view");
  const docTitle = $("doc-title");
  const docMeta = $("doc-meta");
  const docChips = $("doc-chips");
  const docBody = $("doc-body");
  const backBtn = $("back-btn");
  const typeFilters = $("type-filters");
  const btnReonboard = $("btn-reonboard");
  const btnPurge = $("btn-purge");
  const snack = $("snack");
  const tabButtons = document.querySelectorAll(".tab");
  let snackTimer = null;
  let activeTab = "search"; // remembered so "Back" from doc returns here

  const enabledTypes = () => new Set(
    Array.from(typeFilters.querySelectorAll('input[type=checkbox]'))
      .filter((c) => c.checked)
      .map((c) => c.dataset.type)
  );

  async function api(action, params = {}) {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params }),
    });
    if (!r.ok) throw new Error("API " + action + " failed: " + r.status);
    return await r.json();
  }

  async function loadStats() {
    try {
      const s = await api("stats");
      const parts = [];
      const total = s.total != null ? s.total : s.doc_count != null ? s.doc_count : s.documents;
      if (total != null) parts.push(total + " docs");
      if (s.wiki) parts.push(s.wiki + " wiki");
      if (s.memory) parts.push(s.memory + " mem");
      statsText.textContent = parts.length ? parts.join(" · ") : "—";
    } catch (e) { statsText.textContent = "offline"; }
  }

  async function loadHealth() {
    try {
      const h = await api("health");
      if (h && h.read_only) {
        btnReonboard.disabled = true;
        btnPurge.disabled = true;
        btnReonboard.title = "Server started with --read-only";
        btnPurge.title = "Server started with --read-only";
      }
    } catch { /* ignore */ }
  }

  function showSnack(text, kind) {
    if (snackTimer) clearTimeout(snackTimer);
    snack.textContent = text || "";
    snack.className = "snack visible " + (kind || "");
    const ttl = kind === "err" ? 7000 : 4500;
    snackTimer = setTimeout(() => {
      snack.classList.remove("visible");
    }, ttl);
  }

  async function loadWikiList() {
    try {
      const r = await api("wiki_list", {});
      const items = r.articles || r.wiki || r.results || [];
      if (!items.length) {
        wikiCards.innerHTML = '<div class="muted">No wiki articles yet. Use the Search tab or ingest content first.</div>';
        wikiCount.textContent = "0 articles";
        return;
      }
      wikiCount.textContent = items.length + (items.length === 1 ? " article" : " articles");
      wikiCards.innerHTML = "";
      for (const a of items.slice(0, 400)) {
        wikiCards.appendChild(renderWikiCard(a));
      }
    } catch (e) {
      wikiCards.innerHTML = '<div class="muted">Could not load wiki: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function renderWikiCard(a) {
    const card = document.createElement("div");
    card.className = "wiki-card";
    card.dataset.path = a.path;
    const title = document.createElement("div");
    title.className = "wiki-card-title";
    title.textContent = a.title || a.path.split("/").pop().replace(/\\.md$/, "");
    card.appendChild(title);
    if (a.description) {
      const desc = document.createElement("div");
      desc.className = "wiki-card-desc";
      desc.textContent = a.description;
      card.appendChild(desc);
    }
    const meta = document.createElement("div");
    meta.className = "wiki-card-meta";
    if (a.tags && a.tags.length) {
      for (const t of a.tags.slice(0, 3)) {
        const chip = document.createElement("span");
        chip.className = "chip chip-wiki";
        chip.textContent = t;
        meta.appendChild(chip);
      }
    }
    if (a.word_count != null) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = a.word_count + " words";
      meta.appendChild(chip);
    }
    if (meta.childNodes.length) card.appendChild(meta);
    const path = document.createElement("div");
    path.className = "wiki-card-path";
    path.textContent = a.path;
    card.appendChild(path);
    card.addEventListener("click", () => {
      openDoc({ path: a.path, id: a.id, title: title.textContent });
    });
    return card;
  }

  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const runSearch = debounce(async (q) => {
    if (!q || !q.trim()) {
      await showBrowseAll();
      return;
    }
    resultsEmpty.classList.add("hidden");
    resultsList.innerHTML = '<div class="muted">searching…</div>';
    try {
      const r = await api("search", { query: q, limit: 25 });
      renderResults(q, r);
    } catch (e) {
      resultsList.innerHTML = '<div class="muted">Search failed: ' + escapeHtml(e.message) + '</div>';
    }
  }, 180);

  /**
   * Empty-query mode: show all documents filtered by the active source-type
   * chips, most-recent-first. The same result-card renderer is reused so
   * toggling between browse and search is visually consistent.
   */
  async function showBrowseAll() {
    resultsEmpty.classList.add("hidden");
    resultsList.innerHTML = '<div class="muted">loading…</div>';
    try {
      const types = [...enabledTypes()];
      const r = await api("list_docs", { source_types: types, limit: 100 });
      const results = r.results || [];
      const metaParts = [results.length + " shown"];
      if (r.total != null && r.total !== results.length) metaParts.push(r.total + " total");
      if (types.length && types.length < 3) metaParts.push("types: " + types.join(", "));
      resultsMeta.textContent = metaParts.join(" · ");
      resultsList.innerHTML = "";
      if (!results.length) {
        resultsList.innerHTML = '<div class="muted">Nothing to show. Try toggling filter chips or ingest some content.</div>';
        return;
      }
      for (const res of results) resultsList.appendChild(renderResultCard(res));
    } catch (e) {
      resultsList.innerHTML = '<div class="muted">Could not load documents: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function renderResults(q, r) {
    const types = enabledTypes();
    const results = (r.results || []).filter((x) => types.has(x.source_type || "chunk"));
    const metaParts = [results.length + " shown"];
    if (r.total_matches != null) metaParts.push(r.total_matches + " matched");
    if (r.collapsed) metaParts.push(r.collapsed + " collapsed");
    resultsMeta.textContent = metaParts.join(" · ");
    resultsList.innerHTML = "";
    if (!results.length) {
      resultsList.innerHTML = '<div class="muted">No results matching the enabled source types.</div>';
      return;
    }
    for (const res of results) {
      resultsList.appendChild(renderResultCard(res));
    }
  }

  function renderResultCard(res) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.addEventListener("click", () => openDoc({ id: res.id, path: res.path }));

    const top = document.createElement("div");
    top.className = "result-top";
    const type = document.createElement("span");
    type.className = "chip chip-" + (res.source_type || "chunk");
    type.textContent = res.source_type || "chunk";
    top.appendChild(type);
    if (res.canonical_for && res.canonical_for.length) {
      const canon = document.createElement("span");
      canon.className = "chip chip-canonical";
      canon.textContent = "canonical: " + res.canonical_for.join(", ");
      top.appendChild(canon);
    }
    const path = document.createElement("span");
    path.className = "result-path";
    path.textContent = res.path;
    top.appendChild(path);
    if (res.composite_score != null || res.score != null) {
      const score = document.createElement("span");
      score.className = "result-score";
      const val = res.composite_score != null ? res.composite_score : res.score;
      score.textContent = typeof val === "number" ? val.toFixed(2) : String(val);
      top.appendChild(score);
    }
    card.appendChild(top);

    const snippet = document.createElement("div");
    snippet.className = "result-snippet";
    snippet.innerHTML = res.snippet || escapeHtml(res.body_excerpt || "");
    card.appendChild(snippet);

    if (res.also_found_in && res.also_found_in.length) {
      const also = document.createElement("div");
      also.className = "result-also";
      const label = document.createElement("span");
      label.className = "result-also-label";
      label.textContent = "also found in:";
      also.appendChild(label);
      for (const a of res.also_found_in) {
        const span = document.createElement("span");
        span.className = "result-also-item";
        span.textContent = a.path;
        also.appendChild(span);
      }
      card.appendChild(also);
    }

    return card;
  }

  function showTab(name) {
    const target = name === "wiki" ? "wiki" : "search";
    activeTab = target;
    tabButtons.forEach((b) => {
      const on = b.dataset.tab === target;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    searchTab.classList.toggle("hidden", target !== "search");
    wikiTab.classList.toggle("hidden", target !== "wiki");
    docView.classList.add("hidden");
    if (target === "search") searchInput.focus();
  }

  async function openDoc({ id, path, title }) {
    searchTab.classList.add("hidden");
    wikiTab.classList.add("hidden");
    docView.classList.remove("hidden");
    docTitle.textContent = title || path || "Loading…";
    docMeta.textContent = "";
    docBody.innerHTML = '<div class="muted">loading…</div>';
    docChips.innerHTML = "";
    try {
      const params = id ? { id } : { path };
      const resp = await api("get_document", params);
      const doc = resp && resp.document;
      if (!doc || !doc.id) {
        docBody.innerHTML = '<div class="muted">Document not found: ' + escapeHtml(path || id) + '</div>';
        return;
      }
      docTitle.textContent = extractTitle(doc) || doc.path;
      const bits = [];
      if (doc.indexed_at) bits.push("indexed " + new Date(doc.indexed_at).toISOString().slice(0, 10));
      if (doc.brain_id) bits.push(doc.brain_id);
      docMeta.textContent = bits.join(" · ");

      docChips.innerHTML = "";
      const sourceType = deriveSourceType(doc.path);
      const typeChip = document.createElement("span");
      typeChip.className = "chip chip-" + sourceType;
      typeChip.textContent = sourceType;
      docChips.appendChild(typeChip);
      for (const id of (doc.canonical_for || [])) {
        const chip = document.createElement("span");
        chip.className = "chip chip-canonical";
        chip.textContent = "canonical: " + id;
        docChips.appendChild(chip);
      }

      const body = stripFrontmatter(doc.content);
      docBody.innerHTML = renderMarkdown(body);
      wireWikilinks(docBody);
      history.replaceState(null, "", "#" + encodeURIComponent(doc.path));
    } catch (e) {
      docBody.innerHTML = '<div class="muted">Failed to load: ' + escapeHtml(e.message) + '</div>';
    }
  }

  function backToResults() {
    docView.classList.add("hidden");
    showTab(activeTab);
    history.replaceState(null, "", "#");
  }

  function wireWikilinks(root) {
    root.querySelectorAll("a[data-wikilink]").forEach((a) => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        openDoc({ path: a.dataset.wikilink });
      });
    });
  }

  function deriveSourceType(path) {
    if (!path) return "chunk";
    if (path.startsWith("wiki/")) return "wiki";
    if (path.startsWith("memory/") || path.startsWith("memories/")) return "memory";
    return "chunk";
  }

  function stripFrontmatter(content) {
    const m = (content || "").match(/^---\\n[\\s\\S]*?\\n---\\n?([\\s\\S]*)$/);
    return m ? m[1] : (content || "");
  }

  function extractTitle(doc) {
    if (!doc.content) return null;
    const firstH1 = doc.content.match(/^#\\s+(.+)$/m);
    if (firstH1) return firstH1[1].trim();
    const fmTitle = (doc.frontmatter || "").match(/^title:\\s*(.+)$/m);
    return fmTitle ? fmTitle[1].trim().replace(/^["']|["']$/g, "") : null;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Minimal markdown renderer — handles headings, paragraphs, lists, code
  // fences, inline code, bold/italic, links, [[wikilinks]], blockquotes,
  // tables. Intentionally small; no footnotes/html passthrough.
  function renderMarkdown(src) {
    const lines = src.split(/\\r?\\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Fenced code block
      const fence = line.match(/^\`\`\`(\\w*)\\s*$/);
      if (fence) {
        i++;
        const start = i;
        while (i < lines.length && !/^\`\`\`\\s*$/.test(lines[i])) i++;
        const code = lines.slice(start, i).join("\\n");
        out.push('<pre><code>' + escapeHtml(code) + '</code></pre>');
        i++;
        continue;
      }
      // Heading
      const h = line.match(/^(#{1,6})\\s+(.+?)\\s*$/);
      if (h) {
        const level = h[1].length;
        out.push('<h' + level + '>' + inline(h[2]) + '</h' + level + '>');
        i++;
        continue;
      }
      // Blockquote
      if (/^>\\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\\s?/, ""));
          i++;
        }
        out.push('<blockquote>' + inline(buf.join(" ")) + '</blockquote>');
        continue;
      }
      // Horizontal rule
      if (/^(-{3,}|_{3,}|\\*{3,})\\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }
      // List (unordered)
      if (/^\\s*[-*+]\\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\\s*[-*+]\\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\\s*[-*+]\\s+/, ""));
          i++;
        }
        out.push('<ul>' + items.map((it) => '<li>' + inline(it) + '</li>').join("") + '</ul>');
        continue;
      }
      // List (ordered)
      if (/^\\s*\\d+\\.\\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\\s*\\d+\\.\\s+/, ""));
          i++;
        }
        out.push('<ol>' + items.map((it) => '<li>' + inline(it) + '</li>').join("") + '</ol>');
        continue;
      }
      // Table (very simple: header | sep | rows)
      if (i + 1 < lines.length && /\\|/.test(line) && /^\\s*\\|?\\s*-+/.test(lines[i + 1])) {
        const header = line.split("|").map((c) => c.trim()).filter(Boolean);
        i += 2;
        const rows = [];
        while (i < lines.length && /\\|/.test(lines[i]) && lines[i].trim().length > 0) {
          rows.push(lines[i].split("|").map((c) => c.trim()).filter((c, idx, a) => idx > 0 || c.length || a.length > 1));
          i++;
        }
        const head = '<tr>' + header.map((h) => '<th>' + inline(h) + '</th>').join("") + '</tr>';
        const body = rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join("") + '</tr>').join("");
        out.push('<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>');
        continue;
      }
      // Blank line -> paragraph break
      if (line.trim() === "") { i++; continue; }
      // Paragraph: collect consecutive non-blank lines
      const buf = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !/^(\`\`\`|#{1,6}\\s|>\\s|\\s*[-*+]\\s|\\s*\\d+\\.\\s)/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(buf.join(" ")) + '</p>');
    }
    return out.join("\\n");
  }

  function inline(s) {
    let r = escapeHtml(s);
    // inline code: \`...\`
    r = r.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // bold: **...**
    r = r.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    // italic: *...*  (after bold so ** not eaten)
    r = r.replace(/(^|\\W)\\*([^*\\n]+)\\*(?=\\W|$)/g, '$1<em>$2</em>');
    // wikilinks: [[path]]
    r = r.replace(/\\[\\[([^\\]]+)\\]\\]/g, (m, target) => {
      const safe = target.replace(/"/g, "&quot;");
      return '<a href="#' + safe + '" data-wikilink="' + safe + '">' + safe + '</a>';
    });
    // links: [text](url)
    r = r.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
    return r;
  }

  // --- Wire events ---
  tabButtons.forEach((b) => {
    b.addEventListener("click", () => showTab(b.dataset.tab));
  });
  searchForm.addEventListener("submit", (e) => e.preventDefault());
  searchInput.addEventListener("input", () => {
    searchField.classList.toggle("has-value", searchInput.value.length > 0);
    runSearch(searchInput.value);
  });
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchField.classList.remove("has-value");
    runSearch("");
    searchInput.focus();
  });
  typeFilters.addEventListener("change", () => {
    if (searchInput.value.trim()) runSearch(searchInput.value);
    else showBrowseAll();
  });
  backBtn.addEventListener("click", backToResults);

  btnReonboard.addEventListener("click", async () => {
    if (btnReonboard.disabled) return;
    if (!confirm("Re-run onboarding?\\n\\nThis re-detects the repo mode, re-stamps CLAUDE.md / AGENTS.md with the wiki pointer, and rebuilds the search index from chunk and wiki files on disk. Authored content is NOT deleted.")) return;
    btnReonboard.disabled = true;
    btnPurge.disabled = true;
    showSnack("Re-running onboarding…");
    try {
      const r = await api("reonboard", {});
      const msg = "Re-indexed " + r.indexed + " files"
        + (r.onboard && r.onboard.mode ? ' · mode=' + r.onboard.mode : '');
      showSnack(msg, "ok");
      await Promise.all([loadStats(), loadWikiList()]);
    } catch (e) {
      showSnack("Re-onboard failed: " + e.message, "err");
    } finally {
      btnReonboard.disabled = false;
      btnPurge.disabled = false;
    }
  });

  btnPurge.addEventListener("click", async () => {
    if (btnPurge.disabled) return;
    const typed = prompt('This permanently deletes ALL chunks, wiki articles, and memories in this brain. The SQLite index is cleared too.\\n\\nType DELETE to confirm:');
    if (typed !== "DELETE") {
      if (typed !== null) showSnack("Delete cancelled.");
      return;
    }
    btnReonboard.disabled = true;
    btnPurge.disabled = true;
    showSnack("Deleting brain content…");
    try {
      const r = await api("purge_brain", { confirm: "DELETE" });
      if (r.error) {
        showSnack("Delete blocked: " + r.error, "err");
      } else {
        const removed = r.removed || {};
        const summary = Object.entries(removed)
          .map(([k, v]) => v + " " + k)
          .join(", ");
        showSnack("Deleted: " + (summary || "nothing"), "ok");
        await Promise.all([loadStats(), loadWikiList()]);
        backToResults();
      }
    } catch (e) {
      showSnack("Delete failed: " + e.message, "err");
    } finally {
      btnReonboard.disabled = false;
      btnPurge.disabled = false;
    }
  });

  // Deep-link: #<path> → open that doc on load
  window.addEventListener("load", async () => {
    await Promise.all([loadStats(), loadWikiList(), loadHealth(), showBrowseAll()]);
    if (location.hash && location.hash.length > 1) {
      const path = decodeURIComponent(location.hash.slice(1));
      if (path && path !== "") openDoc({ path });
    }
  });
})();
`;
