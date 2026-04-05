import * as path from "node:path";
import { pathToFileURL } from "node:url";

export interface RawChunk {
  content: string;
  metadata: Record<string, unknown>;
}

export interface ExtractOpts {
  brainRoot: string;
}

export interface IngestPlugin {
  extensions: string[];
  name: string;
  extract(filePath: string, opts: ExtractOpts): Promise<RawChunk[]>;
}

/**
 * Loads IngestPlugins from the given paths, resolving each relative to brainRoot.
 * Plugins that fail to load are skipped with a warning.
 */
export async function loadPlugins(
  brainRoot: string,
  pluginPaths: string[]
): Promise<IngestPlugin[]> {
  if (pluginPaths.length === 0) return [];

  const plugins: IngestPlugin[] = [];

  for (const pluginPath of pluginPaths) {
    const absPath = path.isAbsolute(pluginPath)
      ? pluginPath
      : path.resolve(brainRoot, pluginPath);

    try {
      const fileUrl = pathToFileURL(absPath).href;
      const mod = await import(fileUrl);
      const plugin = mod.default as IngestPlugin;

      if (
        plugin &&
        typeof plugin.name === "string" &&
        Array.isArray(plugin.extensions) &&
        typeof plugin.extract === "function"
      ) {
        plugins.push(plugin);
      } else {
        console.warn(
          `[plugins] Skipping plugin at "${pluginPath}": missing name, extensions, or extract`
        );
      }
    } catch (err) {
      console.warn(
        `[plugins] Failed to load plugin at "${pluginPath}": ${(err as Error).message}`
      );
    }
  }

  return plugins;
}

/**
 * Finds the first plugin that handles the given file's extension.
 * Returns null if no plugin matches.
 */
export function findPluginForFile(
  plugins: IngestPlugin[],
  filePath: string
): IngestPlugin | null {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return null;

  for (const plugin of plugins) {
    if (plugin.extensions.some((e) => e.toLowerCase() === ext)) {
      return plugin;
    }
  }

  return null;
}
