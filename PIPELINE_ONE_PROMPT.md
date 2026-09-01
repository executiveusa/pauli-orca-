# PIPELINE: one-prompt unattended cloud runner

## Mission

Finish the regular PIPELINE so a user can start a software project from Pauli Command Center on a phone, disconnect, and let the project continue in the cloud until it reaches a verified result, a review/approval boundary, or a truthful blocked state.

Do not add another general-purpose orchestration framework. Reuse the existing Pauli control plane and Orca runtime, and compose proven loops around it.

## Target operating path

Phone / Pauli Command Center
-> Heisenberg / STARNET mission gateway
-> durable Cloud Runner
-> Ralphy autonomous coding loop
-> Unlazy acceptance gates
-> Gauntlet fresh critic loop
-> Ponytail simplicity review
-> optional Humanizer prose pass
-> GitHub PR / deployment
-> durable receipt back to Command Center

The phone is a control surface, not the runtime. Closing the browser, losing signal, or restarting the API must not stop the mission.

## Reuse these projects

### Ralphy
Use as the inner autonomous coding driver. It already supports single prompts and PRDs, multiple coding engines, parallel isolated worktrees, branch/PR creation, browser verification, and webhook notifications.

### Unlazy
Use as the completion contract. Generate acceptance gates before execution. A mission may not report success until runnable gates are reverified and evidence exists. Fail closed.

### Gauntlet Loop
Use after a coherent build exists. Run a fresh critic with no builder context against a concrete named/fetchable/comparable quality bar. If our output loses, convert the critic defects into the next Ralphy iteration. Do not stop because a fixed round count was reached.

### Ponytail
Apply as a YAGNI/simplicity constraint during implementation and review. Prefer existing platform/browser/framework capabilities and the smallest safe change. Reject unnecessary dependencies and abstractions.

### Humanizer
Use only for user-facing prose, copy, release notes, documentation, and content when relevant. Never rewrite code semantics, structured data, identifiers, or factual claims.

## P0 cloud API

### POST /api/projects
Input:
- `prompt` required
- `repo` or `new_repo`
- `quality_bar` optional
- `engine` optional
- `model` optional
- `deploy_target` optional

Return immediately after durable persistence:
- `project_id`
- `mission_id`
- `status`
- `status_url`

The request must not wait for the build.

### GET /api/projects/:id
Return current durable state, heartbeat, current phase, latest meaningful event, branch/PR/deployment URLs, evidence summary, pending approval, and terminal receipt when present.

### POST /api/projects/:id/approve
Resume an approval-blocked mission.

### POST /api/projects/:id/cancel
Request cooperative cancellation and persist it.

### POST /api/projects/:id/retry
Resume from the last durable checkpoint when policy allows.

## Durable mission state

Use the existing Pauli/STARNET durable store where practical. Do not make process memory authoritative.

States:

`QUEUED -> PLANNING -> BUILDING -> VERIFYING -> CRITIQUING -> FIXING -> READY_FOR_REVIEW -> DEPLOYING -> VERIFIED`

`FIXING` loops back through `BUILDING/VERIFYING/CRITIQUING` until the exit contract is met.

Terminal alternatives:

`BLOCKED | FAILED | CANCELLED`

Persist at minimum:
- mission/project id
- source prompt and normalized execution contract
- target repo
- selected engine/model
- workspace/worktree id
- current state
- attempt number
- heartbeat
- worker lease
- acceptance gate file/path
- critic quality bar
- branch and exact Git SHAs
- PR URL
- preview/production URL when applicable
- compact evidence summary
- pending approval record
- terminal receipt

## Worker

Create one long-running cloud worker service on the existing server/runtime. The worker owns execution; the web app only submits and observes.

Worker requirements:
1. Claim queued jobs with a durable lease.
2. Recover abandoned leases after worker restart.
3. Create an isolated repo/worktree per mission.
4. Normalize the prompt into a PRD/task file plus Unlazy gate ledger.
5. Run Ralphy non-interactively with the configured coding engine.
6. Stream meaningful events into durable mission history.
7. Run declared tests/build/lint/browser checks through the gate contract.
8. Run a fresh Gauntlet critic against the quality bar.
9. If gates fail or critic picks the reference, turn defects into the next task iteration and continue.
10. Run a Ponytail simplicity pass before final acceptance; remove needless complexity without breaking gates.
11. Run Humanizer only on relevant final prose/copy/docs.
12. Push the branch and create/update a PR.
13. Deploy preview when configured and include runtime checks in gates.
14. Require human approval only for policy-defined consequential actions such as protected merge/production deployment/secret changes.
15. Persist the final exact SHA, evidence, URLs and receipt before reporting `VERIFIED`.

## Exit contract

`VERIFIED` is legal only when all are true:
- requested deliverables exist;
- Unlazy gates pass on reverify;
- fresh Gauntlet critic picks our output over the named quality bar, or the mission is a task where a binary objective gate replaces visual/content comparison;
- current branch/commit SHA is persisted;
- PR exists when source changes are involved;
- deployment smoke checks pass when deployment is requested;
- no required approval remains pending.

Never convert timeout, tool failure, missing credential, or incomplete critic/gate work into success.

## Phone UX: only what is needed for P0

Command Center needs one Project Runner screen:
- prompt composer
- repo/new-repo selector
- optional quality bar
- optional engine/model advanced control
- Run button
- status timeline
- latest event
- PR/preview links
- Approve, Cancel, Retry

No terminal babysitting. No requirement to keep the browser open.

## Security and resource bounds

- isolated workspace/worktree per mission
- server-side allowlisted secret injection only
- redact secrets from logs/events
- bounded concurrent missions
- configurable max runtime, retries and spend
- protected merge/production deploy behind policy or approval
- worker cannot silently broaden repository or infrastructure scope

## Build order

### Slice 1 — unattended runner
Implement durable project submission, worker lease/resume, Ralphy execution, status API, and phone status screen. Prove a job continues after disconnect and worker restart.

### Slice 2 — completion loop
Add Unlazy gate creation/reverify, Gauntlet fresh critic feedback loop, Ponytail simplicity review, and final receipts.

### Slice 3 — ship path
Add PR creation, preview deployment verification, policy approvals, notifications, and end-to-end phone test.

Do not begin unrelated polish until all three slices pass.

## End-to-end acceptance test

From a phone:
1. Submit one prompt to modify or create a real test repository.
2. Receive `project_id` immediately.
3. Close the browser.
4. Confirm the cloud worker continues.
5. Restart the worker during the run.
6. Confirm the mission resumes from durable state.
7. Confirm Ralphy produces the implementation in an isolated branch/worktree.
8. Confirm declared gates execute and reverify.
9. Confirm a fresh critic performs the Gauntlet comparison and defects feed back into another iteration when necessary.
10. Confirm simplicity pass does not break gates.
11. Confirm a PR is created with exact SHA and evidence.
12. If deployment was requested, confirm preview/runtime checks pass.
13. Reopen Command Center on the phone and see `VERIFIED` plus PR/deployment links and evidence.

The PIPELINE is not complete until this exact test passes.

## Master implementation instruction

Treat this file as the authoritative P0 mission. Inspect the existing Pauli Command Center, STARNET/Heisenberg gateway, and this Orca fork before changing code. Reuse working contracts rather than replacing them. Implement the three slices in order. After every slice, run its real tests and repair failures before continuing. Keep a durable acceptance ledger. Use separate builder and critic contexts. Continue the build/fix/verify loop without asking the user to babysit routine implementation decisions. Stop only for a true secret/permission requirement or a consequential approval boundary. At the end, perform the full phone-to-cloud acceptance test above and report exact SHAs, PRs, deployment URLs, gate evidence, remaining risks, and rollback points. Do not claim completion from code presence alone.