export interface WikiLink {
  brain: string | null; // null = local, string = cross-brain
  path: string;
  raw: string; // original [[...]] text
}

export function parseWikilinks(text: string): WikiLink[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const results: WikiLink[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const raw = match[0];
    const separatorIndex = inner.indexOf("::");

    if (separatorIndex !== -1) {
      const brain = inner.slice(0, separatorIndex).trim();
      const path = inner.slice(separatorIndex + 2).trim();
      if (brain && path) {
        results.push({ brain, path, raw });
      }
    } else {
      results.push({ brain: null, path: inner, raw });
    }
  }

  return results;
}
