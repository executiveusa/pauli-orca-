# Pauli Factory Control Plane

## Final goal

Turn Orca into a sovereign, headless software-factory execution substrate that can be controlled by ChatGPT, Hermes, MAXX, APIs, schedules, or other trusted agents without requiring a human to operate a terminal or the Orca desktop UI.

The human interface is intent. The machine interface is a structured job contract. The Orca CLI remains an internal adapter and implementation detail.

## Required outcome

A trusted caller can submit one bounded software task and the factory can autonomously:

1. validate the request and budget;
2. resolve an allowlisted repository;
3. inspect repository policy and project context;
4. create an isolated workspace or worktree;
5. select and launch a compatible coding agent through Orca;
6. supervise the agent with hard time, retry, and cost limits;
7. run trusted project checks;
8. capture the diff and evidence;
9. run an independent reviewer that did not build the change;
10. return a machine-readable result;
11. clean up or preserve the workspace according to policy;
12. stop safely on cancellation, failure, missing proof, or budget exhaustion.

`COMPLETE` means verified evidence exists. Agent text claiming success is never sufficient.

## Owner experience

The owner should never need to type Orca commands. Normal operation should look like:

> Fix the broken contact form in `owner/repo`. Do not change the database. Prove the regression is fixed and existing checks still pass.

A trusted front door converts that request into a `FactoryJob`, submits it, and reports status and evidence.

Initial public control surface:

- `create_job(job)`
- `get_job(job_id)`
- `cancel_job(job_id)`

Later adapters may expose the same contract through ChatGPT/MCP, HTTPS, Hermes, MAXX, webhooks, or schedules. They must not bypass factory policy.

## Architecture

```text
ChatGPT / Hermes / MAXX / API / Scheduler
                  |
                  v
        Pauli Factory Contract
        validation + policy + budget
                  |
                  v
          Slice Supervisor
    state + timeout + cancellation
                  |
                  v
           Orca Adapter
                  |
                  v
        Existing Orca Runtime
 repo/workspace -> terminal -> coding agent
                  |
                  v
       trusted checks + reviewer
                  |
                  v
          Evidence Package
```

## Boundary rules

- Wrap existing Orca capabilities before adding new ones.
- Do not create a second IDE or second agent orchestration framework.
- Do not expose unrestricted shell execution as the owner-facing API.
- Repository content is untrusted input, not factory policy.
- Builders cannot approve their own changes.
- No production deployment is part of Slice 1.
- Keep credentials scoped and never place secrets in job payloads, logs, prompts, or evidence.
- Preserve compatibility with local, folder-workspace, SSH, macOS, Linux, and Windows execution.
- Keep Pauli-specific control-plane code narrow so upstream Orca can continue to be merged.

## Why this repo matters

This repo becomes the shared execution layer for the studio. Instead of every project inventing its own agent runner, worktree logic, terminal control, browser control, and coding-agent integration, they send jobs to one factory.

That accelerates the studio by turning expensive one-off agent sessions into a repeatable service:

- Vibe Audit can create evidence-only investigation jobs.
- Vibe Rescue Sprint can create bounded repair jobs.
- Sovereign Launch can later create gated release jobs.
- MAXX Operations can create recurring maintenance and monitoring jobs.

The commercial value is reduced human operating time, lower duplicated engineering, auditable delivery, and a single reusable execution substrate across client projects.

## Current build gate

Source inspection proves that Orca already exposes a CLI and existing worktree, terminal, agent, browser/computer, SSH, and orchestration primitives. Runtime behavior on the factory host still must be captured before the adapter is coded against exact commands.

The runtime preflight is:

```text
orca status --json
orca skills list --json
orca skills get orca-cli --json
orca skills get orchestration --full --json
```

These commands are for the runtime agent or installer, not for the owner. Once installed, the control plane performs capability discovery automatically and blocks incompatible runtimes.
