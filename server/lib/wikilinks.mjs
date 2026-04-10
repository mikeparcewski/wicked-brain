const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

const KNOWN_RELS = new Set([
  "contradicts",
  "supersedes",
  "supports",
  "caused-by",
  "extends",
  "depends-on",
  "questions",
]);

export function parseWikilinks(text) {
  const links = [];
  for (const match of text.matchAll(WIKILINK_RE)) {
    const inner = match[1].trim();
    if (!inner) continue;
    const raw = match[0];
    if (inner.includes("::")) {
      const idx = inner.indexOf("::");
      const left = inner.slice(0, idx).trim();
      const right = inner.slice(idx + 2).trim();
      if (!left || !right) continue;
      if (KNOWN_RELS.has(left)) {
        // Typed relationship link
        links.push({ brain: null, path: right, rel: left, raw });
      } else {
        // Cross-brain link
        links.push({ brain: left, path: right, rel: null, raw });
      }
    } else {
      links.push({ brain: null, path: inner, rel: null, raw });
    }
  }
  return links;
}
