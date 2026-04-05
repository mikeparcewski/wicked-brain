export async function runJobs(
  _positional: string[],
  _flags: Record<string, string | boolean>
): Promise<void> {
  process.stdout.write(
    "Requires agent operations. Install pi-mono dependencies first.\n"
  );
}
