export type FactoryRisk = "green" | "yellow" | "red";

export type FactoryRunState =
  | "received"
  | "validating"
  | "probing"
  | "ready"
  | "running"
  | "testing"
  | "reviewing"
  | "complete"
  | "failed"
  | "blocked"
  | "cancelled";

export interface FactoryBudget {
  runtimeMinutes: number;
  maxWorkers: number;
  maxRetries: number;
  maxCostUsd?: number;
}

export interface FactoryJobContract {
  requestId: string;
  projectId: string;
  repository: string;
  outcome: string;
  constraints: string[];
  proof: string[];
  risk: FactoryRisk;
  budget: FactoryBudget;
  idempotencyKey: string;
}

export interface OrcaCommandReceipt {
  command: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  parsedJson?: unknown;
}

export interface OrcaCapabilityProbe {
  ok: boolean;
  version?: string;
  receipts: OrcaCommandReceipt[];
  failures: string[];
}

export interface FactoryEvidenceReceipt {
  requestId: string;
  projectId: string;
  repository: string;
  state: FactoryRunState;
  createdAt: string;
  updatedAt: string;
  adapterVersion: "terabithia-orca-v1";
  commandReceipts: OrcaCommandReceipt[];
  failures: string[];
}
