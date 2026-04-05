export const CURRENT_SCHEMA = 1;

// BrainConfig — brain.json shape
export interface ModelConfig { provider: string; model: string; }
export interface BrainConfig {
  schema: number; id: string; name: string;
  parents: string[]; links: string[]; plugins: string[];
  models: Record<string, ModelConfig>;
}

// Storage types
export interface WriteOp { path: string; content: string; }
export interface WriteReceipt { path: string; content_hash: string; written_at: string; }
export interface BatchResult { receipts: WriteReceipt[]; failed: Array<{ path: string; error: string }>; }
export interface FileStat { size: number; modified_at: string; is_directory: boolean; is_symlink: boolean; }

// Event log — 4 entry types via discriminated union on "op"
export type LogEntry = LogWriteEntry | LogDeleteEntry | LogTagEntry | LogLinkEntry;
export interface LogWriteEntry { ts: string; op: "write"; path: string; author: string; content_hash: string; source_chunks?: string[]; word_count?: number; }
export interface LogDeleteEntry { ts: string; op: "delete"; path: string; author: string; reason?: string; }
export interface LogTagEntry { ts: string; op: "tag"; path: string; author: string; tags: string[]; }
export interface LogLinkEntry { ts: string; op: "link"; from: string; to: string; link_type: string; author: string; }

// Chunk frontmatter
export interface ChunkEntities { systems: string[]; people: string[]; programs: string[]; metrics: string[]; }
export interface ChunkFrontmatter {
  source: string; source_type: "pdf"|"pptx"|"docx"|"html"|"image"|"md"|"txt"|"csv";
  chunk_id: string; content_type: string[]; contains: string[];
  entities: ChunkEntities; confidence: number; indexed_at: string;
  narrative_theme?: string; authored_by?: string; authored_at?: string;
  source_chunks?: string[]; figures?: string[];
}

// Search types
export interface DeeperHint { tool: string; params: Record<string, unknown>; }
export interface SearchResultEntry { brain: string; path: string; score: number; summary: string; }
export interface SearchResult {
  results: SearchResultEntry[]; total_matches: number; showing: number;
  searched_brains: string[]; unreachable_brains: string[]; deeper: DeeperHint[];
}
export interface FederatedSearchResult extends SearchResult {}
export interface SearchQuery { query: string; depth?: number; limit?: number; offset?: number; filters?: Record<string, string>; }

// Index types
export interface IndexableDocument { id: string; path: string; content: string; frontmatter: Record<string, unknown>; brain_id: string; }
export interface BacklinkEntry { source_path: string; source_brain: string; link_text: string; }
export interface IndexStats { total_documents: number; total_chunks: number; total_wiki_articles: number; last_indexed: string; index_size_bytes: number; }

// Brain reference
export interface BrainRef { id: string; path: string; relationship: "self"|"parent"|"link"; accessible: boolean; }
