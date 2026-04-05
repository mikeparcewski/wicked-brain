import path from "node:path";

export class BrainPath {
  private readonly _relative: string;

  private constructor(relative: string) {
    this._relative = relative;
  }

  /**
   * Creates a BrainPath from a relative string.
   * Rejects absolute paths and paths with `..` traversal after normalization.
   */
  static from(input: string): BrainPath {
    if (path.isAbsolute(input)) {
      throw new Error(`BrainPath.from: absolute paths are not allowed: "${input}"`);
    }

    // Normalize using posix rules for consistency
    const normalized = path.posix.normalize(input.replace(/\\/g, "/"));

    // After normalization, check for traversal
    if (normalized === ".." || normalized.startsWith("../")) {
      throw new Error(`BrainPath.from: path traversal is not allowed: "${input}"`);
    }

    return new BrainPath(normalized);
  }

  /**
   * Resolves to an absolute path given the brain root.
   */
  resolve(brainRoot: string): string {
    return path.resolve(brainRoot, this._relative);
  }

  /**
   * Returns the parent directory as a BrainPath.
   */
  parent(): BrainPath {
    const parentPosix = path.posix.dirname(this._relative);
    // dirname of "." is "." — stay at root
    return new BrainPath(parentPosix);
  }

  /**
   * Returns the filename (basename) portion of the path.
   */
  basename(): string {
    return path.posix.basename(this._relative);
  }

  /**
   * Joins a segment to this path. Rejects traversal in the segment.
   */
  join(segment: string): BrainPath {
    if (path.isAbsolute(segment)) {
      throw new Error(`BrainPath.join: absolute segment is not allowed: "${segment}"`);
    }

    const joined = path.posix.join(this._relative, segment.replace(/\\/g, "/"));

    // Ensure the joined path doesn't escape (starts with ..)
    if (joined === ".." || joined.startsWith("../")) {
      throw new Error(`BrainPath.join: path traversal is not allowed: "${segment}"`);
    }

    return new BrainPath(joined);
  }

  /**
   * Compares two BrainPaths by their relative path string.
   */
  equals(other: BrainPath): boolean {
    return this._relative === other._relative;
  }

  /**
   * Returns the relative path string.
   */
  toString(): string {
    return this._relative;
  }
}
