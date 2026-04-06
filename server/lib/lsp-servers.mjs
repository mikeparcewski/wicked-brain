/**
 * Known language servers map — 40+ servers covering 70+ extensions.
 * Extensible via {brainPath}/_meta/lsp.json.
 */

import { readFileSync } from "node:fs";

export const KNOWN_SERVERS = {
  // Web
  typescript: {
    command: "typescript-language-server", args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"],
    install: { method: "npm", package: "typescript-language-server typescript" }
  },
  html: {
    command: "html-languageserver", args: ["--stdio"],
    extensions: [".html", ".htm"],
    install: { method: "npm", package: "vscode-html-languageserver-bin" }
  },
  css: {
    command: "css-languageserver", args: ["--stdio"],
    extensions: [".css", ".scss", ".less"],
    install: { method: "npm", package: "vscode-css-languageserver-bin" }
  },
  vue: {
    command: "vue-language-server", args: ["--stdio"],
    extensions: [".vue"],
    install: { method: "npm", package: "@vue/language-server" }
  },
  svelte: {
    command: "svelteserver", args: ["--stdio"],
    extensions: [".svelte"],
    install: { method: "npm", package: "svelte-language-server" }
  },
  json: {
    command: "json-languageserver", args: ["--stdio"],
    extensions: [".json", ".jsonc"],
    install: { method: "npm", package: "vscode-json-languageserver" }
  },
  astro: {
    command: "astro-ls", args: ["--stdio"],
    extensions: [".astro"],
    install: { method: "npm", package: "@astrojs/language-server" }
  },
  // Backend
  python: {
    command: "pyright-langserver", args: ["--stdio"],
    extensions: [".py"],
    install: { method: "npm", package: "pyright" }
  },
  go: {
    command: "gopls", args: ["serve"],
    extensions: [".go"],
    install: { method: "go", package: "golang.org/x/tools/gopls" }
  },
  rust: {
    command: "rust-analyzer", args: [],
    extensions: [".rs"],
    install: { method: "rustup", package: "rust-analyzer" }
  },
  java: {
    command: "jdt-language-server", args: [],
    extensions: [".java"],
    install: { method: "manual", package: "Eclipse JDT LS — download from eclipse.org" }
  },
  csharp: {
    command: "omnisharp", args: ["-lsp"],
    extensions: [".cs"],
    install: { method: "dotnet", package: "OmniSharp" }
  },
  cpp: {
    command: "clangd", args: [],
    extensions: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp"],
    install: { method: "brew", package: "llvm" }
  },
  ruby: {
    command: "ruby-lsp", args: ["--stdio"],
    extensions: [".rb"],
    install: { method: "gem", package: "ruby-lsp" }
  },
  php: {
    command: "intelephense", args: ["--stdio"],
    extensions: [".php"],
    install: { method: "npm", package: "intelephense" }
  },
  kotlin: {
    command: "kotlin-language-server", args: [],
    extensions: [".kt", ".kts"],
    install: { method: "brew", package: "kotlin-language-server" }
  },
  scala: {
    command: "metals", args: [],
    extensions: [".scala", ".sc"],
    install: { method: "coursier", package: "metals" }
  },
  elixir: {
    command: "elixir-ls", args: [],
    extensions: [".ex", ".exs"],
    install: { method: "mix", package: "elixir_ls" }
  },
  erlang: {
    command: "erlang_ls", args: ["--stdio"],
    extensions: [".erl"],
    install: { method: "manual", package: "erlang_ls — build from source" }
  },
  // Systems
  zig: {
    command: "zls", args: [],
    extensions: [".zig"],
    install: { method: "brew", package: "zls" }
  },
  nim: {
    command: "nimlsp", args: ["--stdio"],
    extensions: [".nim"],
    install: { method: "nimble", package: "nimlsp" }
  },
  haskell: {
    command: "haskell-language-server", args: ["--stdio"],
    extensions: [".hs", ".lhs"],
    install: { method: "ghcup", package: "hls" }
  },
  ocaml: {
    command: "ocamllsp", args: [],
    extensions: [".ml", ".mli"],
    install: { method: "opam", package: "ocaml-lsp-server" }
  },
  // Scripting
  lua: {
    command: "lua-language-server", args: ["--stdio"],
    extensions: [".lua"],
    install: { method: "brew", package: "lua-language-server" }
  },
  perl: {
    command: "pls", args: ["--stdio"],
    extensions: [".pl", ".pm"],
    install: { method: "cpan", package: "PLS" }
  },
  r: {
    command: "R", args: ["--no-save", "--slave", "-e", "languageserver::run()"],
    extensions: [".r", ".R"],
    install: { method: "r", package: "languageserver" }
  },
  julia: {
    command: "julia", args: ["--project=@.", "-e", "using LanguageServer; runserver()"],
    extensions: [".jl"],
    install: { method: "julia", package: "LanguageServer" }
  },
  bash: {
    command: "bash-language-server", args: ["start"],
    extensions: [".sh", ".bash"],
    install: { method: "npm", package: "bash-language-server" }
  },
  powershell: {
    command: "pwsh", args: ["-NoLogo", "-NoProfile", "-Command", "Import-Module PowerShellEditorServices; Start-EditorServices"],
    extensions: [".ps1", ".psm1", ".psd1"],
    install: { method: "manual", package: "PowerShell Editor Services" }
  },
  // Data & Config
  sql: {
    command: "sql-language-server", args: ["up", "--stdio"],
    extensions: [".sql"],
    install: { method: "npm", package: "sql-language-server" }
  },
  graphql: {
    command: "graphql-lsp", args: ["--stdio"],
    extensions: [".graphql", ".gql"],
    install: { method: "npm", package: "graphql-language-service-cli" }
  },
  terraform: {
    command: "terraform-ls", args: ["serve"],
    extensions: [".tf"],
    install: { method: "brew", package: "terraform-ls" }
  },
  yaml: {
    command: "yaml-language-server", args: ["--stdio"],
    extensions: [".yaml", ".yml"],
    install: { method: "npm", package: "yaml-language-server" }
  },
  toml: {
    command: "taplo", args: ["lsp", "stdio"],
    extensions: [".toml"],
    install: { method: "cargo", package: "taplo-cli" }
  },
  xml: {
    command: "lemminx", args: [],
    extensions: [".xml", ".xsd", ".xsl"],
    install: { method: "manual", package: "Eclipse LemMinX" }
  },
  // Mobile
  swift: {
    command: "sourcekit-lsp", args: [],
    extensions: [".swift"],
    install: { method: "manual", package: "Built into Xcode" }
  },
  dart: {
    command: "dart", args: ["language-server", "--protocol=lsp"],
    extensions: [".dart"],
    install: { method: "brew", package: "dart" }
  },
  // Infra
  dockerfile: {
    command: "docker-langserver", args: ["--stdio"],
    extensions: [],
    filenames: ["Dockerfile", "Dockerfile.*"],
    install: { method: "npm", package: "dockerfile-language-server-nodejs" }
  },
  ansible: {
    command: "ansible-language-server", args: ["--stdio"],
    extensions: [],
    install: { method: "npm", package: "@ansible/ansible-language-server" }
  },
  // Docs
  markdown: {
    command: "marksman", args: ["server"],
    extensions: [".md", ".markdown"],
    install: { method: "brew", package: "marksman" }
  },
  latex: {
    command: "texlab", args: [],
    extensions: [".tex"],
    install: { method: "cargo", package: "texlab" }
  },
  // Other
  clojure: {
    command: "clojure-lsp", args: ["--stdio"],
    extensions: [".clj", ".cljs", ".cljc", ".edn"],
    install: { method: "brew", package: "clojure-lsp/brew/clojure-lsp" }
  },
  fsharp: {
    command: "fsautocomplete", args: ["--lsp"],
    extensions: [".fs", ".fsx", ".fsi"],
    install: { method: "dotnet", package: "fsautocomplete" }
  },
  gleam: {
    command: "gleam", args: ["lsp"],
    extensions: [".gleam"],
    install: { method: "brew", package: "gleam" }
  },
  solidity: {
    command: "solidity-lsp", args: ["--stdio"],
    extensions: [".sol"],
    install: { method: "npm", package: "@nomicfoundation/hardhat-language-server" }
  },
  prisma: {
    command: "prisma-language-server", args: ["--stdio"],
    extensions: [".prisma"],
    install: { method: "npm", package: "@prisma/language-server" }
  },
  protobuf: {
    command: "buf", args: ["lsp"],
    extensions: [".proto"],
    install: { method: "brew", package: "bufbuild/buf/buf" }
  },
  d: {
    command: "serve-d", args: [],
    extensions: [".d"],
    install: { method: "dub", package: "serve-d" }
  },
  v: {
    command: "v-analyzer", args: ["--stdio"],
    extensions: [".v"],
    install: { method: "manual", package: "v-analyzer — download from GitHub" }
  },
};

// Build extension → server key lookup map
const EXTENSION_MAP = {};
for (const [key, server] of Object.entries(KNOWN_SERVERS)) {
  for (const ext of server.extensions || []) {
    if (!EXTENSION_MAP[ext]) EXTENSION_MAP[ext] = key;
  }
}

/**
 * Resolve a file extension to its language server config.
 * Returns the server config object with key, or null if no server known.
 */
export function resolveServer(extension, overrides = {}) {
  // Check overrides first (user config)
  for (const [key, server] of Object.entries(overrides)) {
    if (server.extensions && server.extensions.includes(extension)) {
      return { key, ...server };
    }
  }
  // Then check built-in map
  const key = EXTENSION_MAP[extension];
  if (!key) return null;
  return { key, ...KNOWN_SERVERS[key] };
}

/**
 * Load user overrides from _meta/lsp.json.
 * Returns merged server config (user overrides take precedence).
 */
export function loadUserConfig(brainPath) {
  try {
    const configPath = `${brainPath}/_meta/lsp.json`;
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config.servers || {};
  } catch {
    return {};
  }
}

/** Get all known extensions (for FileWatcher filtering). */
export function getKnownExtensions(overrides = {}) {
  const extensions = new Set();
  for (const server of Object.values(KNOWN_SERVERS)) {
    for (const ext of server.extensions || []) extensions.add(ext);
  }
  for (const server of Object.values(overrides)) {
    for (const ext of server.extensions || []) extensions.add(ext);
  }
  return extensions;
}
