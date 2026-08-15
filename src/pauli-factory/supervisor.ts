import type {
  FactoryEvidenceReceipt,
  FactoryJobContract,
  FactoryRunState,
} from "./contracts.js";
import { OrcaCliAdapter } from "./orca-cli-adapter.js";

function validateJob(job: FactoryJobContract): string[] {
  const failures: string[] = [];
  if (!job.requestId.trim()) failures.push("requestId is required.");
  if (!job.projectId.trim()) failures.push("projectId is required.");
  if (!job.repository.trim() || !job.repository.includes("/")) {
    failures.push("repository must be in owner/name form.");
  }
  if (!job.outcome.trim()) failures.push("outcome is required.");
  if (!job.idempotencyKey.trim()) failures.push("idempotencyKey is required.");
  if (job.budget.runtimeMinutes <= 0) failures.push("runtimeMinutes must be greater than zero.");
  if (job.budget.maxWorkers <= 0) failures.push("maxWorkers must be greater than zero.");
  if (job.budget.maxRetries < 0) failures.push("maxRetries cannot be negative.");
  return failures;
}

export class PauliFactorySupervisor {
  constructor(private readonly orca: OrcaCliAdapter = new OrcaCliAdapter()) {}

  async prepare(job: FactoryJobContract): Promise<FactoryEvidenceReceipt> {
    const createdAt = new Date().toISOString();
    const validationFailures = validateJob(job);

    if (validationFailures.length > 0) {
      return this.receipt(job, "failed", createdAt, [], validationFailures);
    }

    const probe = await this.orca.probeCapabilities();
    if (!probe.ok) {
      return this.receipt(job, "blocked", createdAt, probe.receipts, probe.failures);
    }

    return this.receipt(job, "ready", createdAt, probe.receipts, []);
  }

  private receipt(
    job: FactoryJobContract,
    state: FactoryRunState,
    createdAt: string,
    commandReceipts: FactoryEvidenceReceipt["commandReceipts"],
    failures: string[],
  ): FactoryEvidenceReceipt {
    return {
      requestId: job.requestId,
      projectId: job.projectId,
      repository: job.repository,
      state,
      createdAt,
      updatedAt: new Date().toISOString(),
      adapterVersion: "terabithia-orca-v1",
      commandReceipts,
      failures,
    };
  }
}
