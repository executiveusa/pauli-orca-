import { describe, expect, it } from "vitest";
import { OrcaCliAdapter, type OrcaCommandRunner } from "./orca-cli-adapter.js";
import { PauliFactorySupervisor } from "./supervisor.js";
import type { FactoryJobContract } from "./contracts.js";

const validJob: FactoryJobContract = {
  requestId: "req_01",
  projectId: "proj_test",
  repository: "executiveusa/test-repo",
  outcome: "Make one bounded verified change.",
  constraints: ["no production deployment"],
  proof: ["tests", "independent_review"],
  risk: "yellow",
  budget: {
    runtimeMinutes: 20,
    maxWorkers: 2,
    maxRetries: 1,
  },
  idempotencyKey: "idem_req_01",
};

function successfulRunner(): OrcaCommandRunner {
  return async (args) => ({
    exitCode: 0,
    stdout: JSON.stringify(args[0] === "status" ? { version: "test-version" } : { ok: true }),
    stderr: "",
  });
}

describe("OrcaCliAdapter", () => {
  it("requires every capability probe command to return valid JSON", async () => {
    const adapter = new OrcaCliAdapter(successfulRunner());
    const probe = await adapter.probeCapabilities();

    expect(probe.ok).toBe(true);
    expect(probe.version).toBe("test-version");
    expect(probe.receipts).toHaveLength(4);
    expect(probe.failures).toEqual([]);
  });

  it("fails closed when a capability probe command fails", async () => {
    const runner: OrcaCommandRunner = async (args) => {
      if (args[0] === "skills" && args[1] === "get" && args[2] === "orchestration") {
        return { exitCode: 2, stdout: "", stderr: "missing skill" };
      }
      return { exitCode: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
    };

    const adapter = new OrcaCliAdapter(runner);
    const probe = await adapter.probeCapabilities();

    expect(probe.ok).toBe(false);
    expect(probe.failures.some((failure) => failure.includes("orchestration"))).toBe(true);
  });

  it("does not expose arbitrary command groups", async () => {
    const adapter = new OrcaCliAdapter(successfulRunner());
    await expect(adapter.run(["shell", "rm", "-rf", "/"])).rejects.toThrow("not allowed");
  });
});

describe("PauliFactorySupervisor", () => {
  it("marks a job ready only after the Orca capability gate passes", async () => {
    const supervisor = new PauliFactorySupervisor(new OrcaCliAdapter(successfulRunner()));
    const receipt = await supervisor.prepare(validJob);

    expect(receipt.state).toBe("ready");
    expect(receipt.commandReceipts).toHaveLength(4);
    expect(receipt.failures).toEqual([]);
  });

  it("blocks execution when Orca capabilities are not proven", async () => {
    const failingRunner: OrcaCommandRunner = async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "orca unavailable",
    });
    const supervisor = new PauliFactorySupervisor(new OrcaCliAdapter(failingRunner));
    const receipt = await supervisor.prepare(validJob);

    expect(receipt.state).toBe("blocked");
    expect(receipt.failures.length).toBeGreaterThan(0);
  });
});
