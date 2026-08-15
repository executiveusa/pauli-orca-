import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OrcaCapabilityProbe, OrcaCommandReceipt } from "./contracts.js";

const execFileAsync = promisify(execFile);

export interface OrcaCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type OrcaCommandRunner = (args: readonly string[]) => Promise<OrcaCommandResult>;

const ALLOWED_GROUPS = new Set([
  "status",
  "skills",
  "worktree",
  "terminal",
  "orchestration",
  "agent",
  "environment",
  "diagnostics",
  "project",
  "repo",
]);

function assertSafeArgs(args: readonly string[]): void {
  if (args.length === 0) {
    throw new Error("Orca command arguments are required.");
  }

  const group = args[0];
  if (!ALLOWED_GROUPS.has(group)) {
    throw new Error(`Orca command group '${group}' is not allowed by the factory adapter.`);
  }

  for (const arg of args) {
    if (arg.includes("\0") || arg.includes("\n") || arg.includes("\r")) {
      throw new Error("Orca command contains an unsafe control character.");
    }
  }
}

export function createDefaultOrcaRunner(binary = process.env.ORCA_CLI_BIN || "orca"): OrcaCommandRunner {
  return async (args) => {
    assertSafeArgs(args);
    try {
      const result = await execFileAsync(binary, [...args], {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      return {
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        code?: string | number;
        stdout?: string;
        stderr?: string;
      };
      return {
        exitCode: typeof err.code === "number" ? err.code : 1,
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
      };
    }
  };
}

function parseJson(stdout: string): unknown | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export class OrcaCliAdapter {
  constructor(private readonly runner: OrcaCommandRunner = createDefaultOrcaRunner()) {}

  async run(args: readonly string[]): Promise<OrcaCommandReceipt> {
    assertSafeArgs(args);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const result = await this.runner(args);
    const finished = Date.now();

    return {
      command: ["orca", ...args],
      startedAt,
      finishedAt: new Date(finished).toISOString(),
      durationMs: finished - started,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      parsedJson: parseJson(result.stdout),
    };
  }

  async probeCapabilities(): Promise<OrcaCapabilityProbe> {
    const commands: readonly (readonly string[])[] = [
      ["status", "--json"],
      ["skills", "list", "--json"],
      ["skills", "get", "orca-cli", "--json"],
      ["skills", "get", "orchestration", "--full", "--json"],
    ];

    const receipts: OrcaCommandReceipt[] = [];
    const failures: string[] = [];

    for (const command of commands) {
      const receipt = await this.run(command);
      receipts.push(receipt);
      if (receipt.exitCode !== 0) {
        failures.push(`${command.join(" ")} exited ${receipt.exitCode}: ${receipt.stderr.trim()}`);
      } else if (receipt.parsedJson === undefined) {
        failures.push(`${command.join(" ")} did not return valid JSON.`);
      }
    }

    const statusJson = receipts[0]?.parsedJson;
    const version =
      typeof statusJson === "object" && statusJson !== null && "version" in statusJson
        ? String((statusJson as { version?: unknown }).version || "") || undefined
        : undefined;

    return {
      ok: failures.length === 0,
      version,
      receipts,
      failures,
    };
  }
}
