# Pauli Orca Factory Gateway

This is the narrow private bridge between Terabithia and the real Orca CLI/runtime.

It is not a second orchestrator and it does not claim that a coding task is complete. Its job is to prove that a worker host can prepare an isolated repository/worktree using real Git and Orca commands, then return command receipts to Terabithia.

## Authority

```text
Command Center -> Hermes -> Terabithia -> this gateway -> Orca CLI/runtime -> isolated worktree
```

The browser must never call this service directly.

## Required host software

- Node.js 20+
- Git
- a built/installed Orca CLI available as `orca`, or set `ORCA_BIN`
- an Orca headless runtime reachable by that CLI (`orca serve` on the worker host or a configured remote environment)

Orca already owns project/worktree/terminal/orchestration behavior. This gateway only exposes a bounded factory contract to Terabithia.

## Environment

Same-host operation is the default and safest mode:

```bash
export PAULI_FACTORY_TOKEN='use-a-secret-broker-value'
export PAULI_SANDBOX_ROOT="$HOME/.orca/pauli-sandboxes"
export ORCA_FACTORY_HOST='127.0.0.1'
export ORCA_FACTORY_PORT='4810'
export ORCA_BIN='orca'
```

Do not place the token in Git, logs, receipts, browser JavaScript or model prompts.

Terabithia uses the same token plus:

```bash
export ORCA_FACTORY_BASE_URL='http://127.0.0.1:4810'
export PAULI_FACTORY_TOKEN='same-scoped-secret'
```

### Separate-host operation

The gateway rejects non-loopback binds by default. If Terabithia and Orca must run on separate hosts, first place both hosts on an authenticated encrypted overlay such as Tailscale or WireGuard, restrict the gateway firewall to that overlay, then explicitly attest that boundary:

```bash
export ORCA_FACTORY_HOST='<overlay-address>'
export ORCA_FACTORY_ENCRYPTED_OVERLAY='1'
```

Do not set `ORCA_FACTORY_ENCRYPTED_OVERLAY=1` for a public, ordinary LAN, or otherwise unencrypted listener. If the gateway is exposed through a reverse proxy instead of an encrypted overlay, terminate TLS with certificate validation at that boundary and keep the gateway listener itself on loopback.

## Start

Start the Orca runtime first:

```bash
orca serve --no-pairing
```

Then start the factory gateway from this repository:

```bash
node src/cli/pauli-factory/server.mjs
```

The services should be supervised by the host's existing process manager. Do not add another orchestration platform solely for these two processes.

## Proof sequence

Presence only:

```bash
curl http://127.0.0.1:4810/health
```

Authenticated capability proof:

```bash
curl -H "Authorization: Bearer $PAULI_FACTORY_TOKEN" \
  http://127.0.0.1:4810/v1/capabilities
```

A passing capability result requires real command receipts for Git and the Orca runtime. `/health` alone is not readiness proof.

Prepare a sandbox:

```bash
curl -X POST \
  -H "Authorization: Bearer $PAULI_FACTORY_TOKEN" \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:4810/v1/jobs/prepare \
  -d '{
    "requestId":"smoke-001",
    "projectId":"starnet",
    "repository":"executiveusa/pauli-starnet",
    "outcome":"prepare an isolated coding workspace only",
    "constraints":["sandbox-only","no-production-deploy","no-main-write"],
    "proof":["git receipt","Orca worktree receipt"],
    "risk":"yellow",
    "budget":{"runtimeMinutes":15,"maxWorkers":1,"maxRetries":1},
    "idempotencyKey":"starnet-smoke-001"
  }'
```

`state: "ready"` means only that repo/worktree preparation succeeded. It does not mean code was changed, tests passed, a PR exists, a preview exists or anything shipped.

## Concurrency and failure behavior

- Missing/wrong token -> `401`.
- Red-risk job -> rejected before sandbox mutation.
- Non-loopback bind without encrypted-overlay attestation -> process refuses to start.
- Orca unavailable -> capability `ok: false`; prepare returns blocked/failed evidence.
- Git/Orca command failure -> no synthetic success.
- Same idempotency key -> preparation is serialized and a safe existing receipt is reused.
- Timed-out subprocess -> SIGTERM, bounded grace period, then SIGKILL with exit code `124` if needed.
- Receipt writes use unique temporary files and atomic rename.

## Rollback

This gateway is additive. Terabithia continues to fail closed when it cannot reach a verified Orca factory. Rolling back this slice means reverting the candidate PR and stopping/removing the gateway process; no production data migration is required.
