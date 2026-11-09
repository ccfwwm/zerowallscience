import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function commandOutput(command: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { encoding: "utf8", timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 });
    return `${stdout}${stderr}`.trim();
  } catch { return undefined; }
}
