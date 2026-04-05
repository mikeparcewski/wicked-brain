import type { IndexableDocument, SearchQuery, SearchResult, FederatedSearchResult, BacklinkEntry, IndexStats, BrainRef } from "./types.js";

export interface SearchAdapter {
  index(doc: IndexableDocument): Promise<void>;
  remove(id: string): Promise<void>;
  reindex(docs: IndexableDocument[]): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  searchFederated(query: SearchQuery, brains: BrainRef[]): Promise<FederatedSearchResult>;
  backlinks(id: string): Promise<BacklinkEntry[]>;
  forwardLinks(id: string): Promise<string[]>;
  stats(): Promise<IndexStats>;
}
