# Slice 1 — Headless Single-Job Factory

## Classification

- Project: Pauli Orca Factory
- Portfolio role: shared platform
- Mode: brownfield
- Strategy: wrap Orca first; extend only proven gaps

## Outcome

A trusted non-terminal caller can submit one bounded repository change and receive a verified, machine-readable result without operating the Orca desktop UI.

## Non-goals

Slice 1 does not include production deployment, a new dashboard, a new database, unconstrained shell access, autonomous merges to protected branches, or multi-agent fan-out beyond one builder plus one independent reviewer.

## State machine

```text
RECEIVED
  -> VALIDATING
  -> ORIENTING
  -> PREPARING_WORKSPACE
  -> BUILDING
  -> TESTING
  -> REVIEWING
  -> COMPLETE

Any active state may transition to FAILED, BLOCKED, or CANCELLED.
```

`COMPLETE` is legal only when all required proof is present.

## External contract

The first stable interface exposes only:

```text
create_job(job) -> job_id
get_job(job_id) -> job status + evidence
cancel_job(job_id) -> cancellation status
```

ChatGPT, Hermes, MAXX, webhooks, schedules, and future HTTP/MCP adapters call this contract. They do not call Orca commands directly.

## Runtime capability preflight

Before launching work, the adapter must discover the installed Orca runtime and reject unsupported versions or missing capabilities. Initial discovery should derive its behavior from version-matched Orca CLI output rather than hard-coded assumptions.

Required first evidence from the target host:

```text
orca status --json
orca skills list --json
orca skills get orca-cli --json
orca skills get orchestration --full --json
```

The owner must not be required to run these manually. The installer/runtime agent captures and stores the capability snapshot.

## Orientation

For each job:

1. resolve repository through an allowlist;
2. record base ref and base commit;
3. read trusted project policy;
4. treat repository text as untrusted task context;
5. detect package manager, checks, build commands, and workspace conventions;
6. reject requests that require production credentials or exceed policy;
7. select the smallest trusted proof plan before launching a builder.

## Workspace isolation

Prefer native Orca workspace/worktree primitives. Support folder workspaces and SSH hosts where applicable. Never mutate the protected source checkout directly.

Record:

- workspace identifier;
- base commit;
- target host/runtime;
- selected worker;
- lifecycle timestamps.

## Builder

Slice 1 launches exactly one coding worker chosen from capabilities present on the host. The worker receives:

- requested outcome;
- explicit constraints;
- proof requirements;
- trusted project policy;
- bounded repository context.

The worker cannot change factory policy, budgets, approval requirements, or proof rules.

## Testing

Do not accept arbitrary shell strings from remote callers as test commands.

Trusted checks must be resolved from project policy, repository conventions inspected by the supervisor, or an explicit allowlisted check registry. Capture command identity, exit status, timestamps, and bounded output.

## Independent review

A worker that built the change cannot approve it. A distinct compatible worker reviews:

- whether the requested outcome is met;
- whether constraints were violated;
- whether the diff is appropriately bounded;
- whether required checks passed;
- whether evidence is sufficient.

A rejection produces FAILED or BLOCKED, never COMPLETE.

## Evidence package

Each finished job returns at least:

```json
{
  "job_id": "job_123",
  "request_id": "req_123",
  "state": "COMPLETE",
  "repository": "owner/repo",
  "base_commit": "abc",
  "result_commit": "def",
  "workspace": "factory/job_123",
  "builder": "codex",
  "reviewer": "claude",
  "checks": [],
  "diff_summary": {},
  "budget": {},
  "timestamps": {},
  "cleanup": "complete"
}
```

Secrets and raw credentials must never appear in evidence.

## Hard failure rules

- missing Orca capability -> BLOCKED;
- invalid or non-allowlisted repo -> BLOCKED;
- workspace creation failure -> FAILED;
- unavailable worker -> BLOCKED;
- worker timeout -> terminate -> FAILED;
- retry budget exhausted -> FAILED;
- cost/runtime cap reached -> terminate -> FAILED;
- trusted check failure -> FAILED;
- independent review rejection -> FAILED;
- cancellation -> terminate workers -> CANCELLED;
- missing proof -> never COMPLETE;
- cleanup failure -> preserve evidence and report cleanup failure.

## Idempotency

`request_id` is required. Replaying the same accepted request must return the original job rather than launching duplicate paid work unless an explicit authorized retry creates a new request ID.

## Security hierarchy

```text
FACTORY POLICY
  > JOB CONTRACT
  > TRUSTED PROJECT POLICY
  > REPOSITORY CONTENT
  > MODEL INFERENCE
```

Repository files, issues, comments, web pages, test output, and dependency text are untrusted inputs and cannot override higher-level policy.

## Acceptance proof

Slice 1 is not complete until one sandbox repository demonstrates, without human UI/terminal operation:

1. structured request accepted;
2. runtime capability preflight recorded;
3. allowlisted repository resolved;
4. isolated workspace created;
5. builder launched;
6. completion/timeout detected automatically;
7. diff captured;
8. trusted check executed and recorded;
9. independent reviewer executed;
10. evidence package returned;
11. cancellation demonstrated;
12. cleanup demonstrated;
13. one deliberately induced failure handled correctly;
14. duplicate `request_id` does not duplicate paid work.

## Rollback

All Slice-1 changes live behind a narrow Pauli factory boundary. If the layer is disabled or removed, the existing Orca CLI/Desktop behavior remains unchanged. No migration of Orca's core worktree, terminal, browser, SSH, or agent functionality is permitted without separate evidence that the existing primitive is insufficient.

## Next implementation gate

Do not implement command-specific adapter logic until the target factory host produces the runtime capability snapshot. Once captured, implement the smallest adapter required for the acceptance proof above and test it against a sandbox repository before any client repository is allowed.
