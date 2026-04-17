import { test } from "node:test";
import assert from "node:assert/strict";
import { renderViewerHtml } from "../lib/viewer-page.mjs";

test("renderViewerHtml: returns a single HTML document", () => {
  const html = renderViewerHtml({ brainId: "test-brain" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>test-brain"));
  assert.ok(html.includes("</html>"));
});

test("renderViewerHtml: escapes brain id", () => {
  const html = renderViewerHtml({ brainId: '<script>alert(1)</script>' });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("renderViewerHtml: defaults brain id when omitted", () => {
  const html = renderViewerHtml();
  assert.ok(html.includes("<title>brain"));
});

test("renderViewerHtml: embeds search + wiki + doc view scaffolding", () => {
  const html = renderViewerHtml({ brainId: "x" });
  for (const id of ["search-input", "results-list", "doc-body", "wiki-cards", "stats-chip", "type-filters", "search-tab", "wiki-tab"]) {
    assert.ok(html.includes(id), `missing element id=${id}`);
  }
});

test("renderViewerHtml: tab buttons are present with data-tab attrs", () => {
  const html = renderViewerHtml({ brainId: "x" });
  assert.ok(/data-tab="search"/.test(html));
  assert.ok(/data-tab="wiki"/.test(html));
  assert.ok(html.includes('class="tabs"'));
});

test("renderViewerHtml: exposes AppBar action buttons + snackbar", () => {
  const html = renderViewerHtml({ brainId: "x" });
  for (const id of ["btn-reonboard", "btn-purge", "snack"]) {
    assert.ok(html.includes(id), `missing element id=${id}`);
  }
  // AppBar button class signals the move-to-header layout.
  assert.ok(html.includes("app-bar-btn"));
});

test("renderViewerHtml: search field lives in the content toolbar", () => {
  const html = renderViewerHtml({ brainId: "x" });
  assert.ok(html.includes("content-toolbar"));
  // The search field must appear AFTER the content-toolbar container opens.
  const toolbarIdx = html.indexOf("content-toolbar");
  const searchIdx = html.indexOf('id="search-input"');
  assert.ok(toolbarIdx > 0 && searchIdx > toolbarIdx);
});

test("renderViewerHtml: client JS references the /api endpoint", () => {
  const html = renderViewerHtml({ brainId: "x" });
  // The API path is a string in the client bundle.
  assert.ok(html.includes("/api"));
  // Sanity: it should reference the actions we depend on.
  for (const action of ["search", "stats", "wiki_list", "get_document", "reonboard", "purge_brain", "list_docs"]) {
    assert.ok(html.includes(action), `missing action reference: ${action}`);
  }
});

test("renderViewerHtml: Material-style primary color token present", () => {
  const html = renderViewerHtml({ brainId: "x" });
  // MUI default primary blue — a lightweight guard that the palette survived
  // future refactors.
  assert.ok(html.includes("#1976d2"));
});
