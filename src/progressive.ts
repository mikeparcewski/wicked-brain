import type { BrainHandle } from "./brain.js";
import type { BrainPath } from "./brain-path.js";
import { parseFrontmatter } from "./frontmatter.js";
import { parseWikilinks } from "./wikilinks.js";

export interface ProgressiveReadResult {
  path: string;
  word_count: number;
  link_count: number;
  frontmatter?: Record<string, unknown>;
  summary?: string;
  sections?: string[];
  content?: string;
  truncated: boolean;
  related: string[];
}

export class ProgressiveLoader {
  private brain: BrainHandle;

  constructor(brain: BrainHandle) {
    this.brain = brain;
  }

  async read(
    filePath: BrainPath,
    depth: number,
    sectionFilter?: string[]
  ): Promise<ProgressiveReadResult> {
    const rawContent = await this.brain.storage.read(filePath);
    const { frontmatter, body } = parseFrontmatter(rawContent);

    const words = body.trim().split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    const wikilinks = parseWikilinks(rawContent);
    const linkCount = wikilinks.length;
    const related = wikilinks.map((l) => l.path);

    if (depth === 0) {
      return {
        path: filePath.toString(),
        word_count: wordCount,
        link_count: linkCount,
        frontmatter,
        truncated: true,
        related,
      };
    }

    // Extract sections (headings)
    const sections = extractHeadings(body);

    // First paragraph as summary
    const summary = extractFirstParagraph(body);

    if (depth === 1) {
      return {
        path: filePath.toString(),
        word_count: wordCount,
        link_count: linkCount,
        frontmatter,
        summary,
        sections,
        truncated: true,
        related,
      };
    }

    // depth >= 2: full content or filtered sections
    let content: string;
    let truncated = false;

    if (sectionFilter && sectionFilter.length > 0) {
      content = extractSections(body, sectionFilter);
      truncated = content.length < body.length;
    } else {
      content = body;
    }

    return {
      path: filePath.toString(),
      word_count: wordCount,
      link_count: linkCount,
      frontmatter,
      summary,
      sections,
      content,
      truncated,
      related,
    };
  }
}

/** Extract all heading lines from markdown body */
function extractHeadings(body: string): string[] {
  const lines = body.split("\n");
  return lines
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => line.replace(/^#+\s+/, "").trim());
}

/** Extract the first non-empty paragraph from the body */
function extractFirstParagraph(body: string): string {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length === 0) return "";
  // Return first paragraph, stripping any heading markers
  return paragraphs[0]
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join(" ")
    .trim();
}

/** Extract content of specified sections by heading name */
function extractSections(body: string, sectionFilter: string[]): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let inSection = false;
  let currentLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (sectionFilter.some((f) => title.toLowerCase().includes(f.toLowerCase()))) {
        inSection = true;
        currentLevel = level;
        result.push(line);
      } else if (inSection && level <= currentLevel) {
        // Same or higher-level heading ends this section
        inSection = false;
      } else if (inSection) {
        result.push(line);
      }
    } else if (inSection) {
      result.push(line);
    }
  }

  return result.join("\n").trim();
}
