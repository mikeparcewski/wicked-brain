const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export function parseWikilinks(text) {
  const links = [];
  for (const match of text.matchAll(WIKILINK_RE)) {
    const inner = match[1].trim();
    if (!inner) continue;
    const raw = match[0];
    if (inner.includes("::")) {
      const idx = inner.indexOf("::");
      const brain = inner.slice(0, idx).trim();
      const path = inner.slice(idx + 2).trim();
      if (brain && path) links.push({ brain, path, raw });
    } else {
      links.push({ brain: null, path: inner, raw });
    }
  }
  return links;
}
