import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const HOST = process.env.ORCA_FACTORY_HOST || '127.0.0.1'
const PORT = Number(process.env.ORCA_FACTORY_PORT || 4810)
const TOKEN = process.env.PAULI_FACTORY_TOKEN || ''
const ORCA_BIN = process.env.ORCA_BIN || 'orca'
const GIT_BIN = process.env.GIT_BIN || 'git'
const DEFAULT_SANDBOX_ROOT = path.join(os.homedir(), '.orca', 'pauli-sandboxes')
const SANDBOX_ROOT = path.resolve(process.env.PAULI_SANDBOX_ROOT || DEFAULT_SANDBOX_ROOT)
const MAX_OUTPUT_BYTES = Number(process.env.ORCA_FACTORY_MAX_OUTPUT_BYTES || 65536)
const COMMAND_TIMEOUT_MS = Number(process.env.ORCA_FACTORY_COMMAND_TIMEOUT_MS || 120000)

const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const SAFE_SEGMENT_RE = /[^A-Za-z0-9_.-]+/g

function now() {
  return new Date().toISOString()
}

function redact(value) {
  return String(value || '')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:token|secret|password|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
}

function bounded(value) {
  const text = redact(value)
  if (Buffer.byteLength(text) <= MAX_OUTPUT_BYTES) {
    return text
  }
  return `${text.slice(0, MAX_OUTPUT_BYTES)}\n[OUTPUT_TRUNCATED]`
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function authorized(req) {
  if (!TOKEN) {
    return false
  }
  const header = String(req.headers.authorization || '')
  if (!header.startsWith('Bearer ')) {
    return false
  }
  const supplied = Buffer.from(header.slice(7).trim())
  const expected = Buffer.from(TOKEN)
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected)
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk.toString()
    if (raw.length > 1_000_000) {
      throw new Error('Request body too large')
    }
  }
  if (!raw.trim()) {
    return {}
  }
  return JSON.parse(raw)
}

function safeSegment(value, fallback) {
  const clean = String(value || '').replace(SAFE_SEGMENT_RE, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return clean || fallback
}

function assertWithinSandbox(candidate) {
  const relative = path.relative(SANDBOX_ROOT, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('sandbox path escaped configured root')
  }
}

function parseJson(stdout) {
  const text = String(stdout || '').trim()
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function run(command, args, options = {}) {
  const startedAt = now()
  const started = Date.now()
  const result = await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (payload) => {
      if (settled) {
        return
      }
      settled = true
      resolve(payload)
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ exitCode: 124, stdout, stderr: `${stderr}\ncommand timed out` })
    }, options.timeoutMs || COMMAND_TIMEOUT_MS)

    child.stdout?.on('data', (chunk) => {
      if (Buffer.byteLength(stdout) < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString()
      }
    })
    child.stderr?.on('data', (chunk) => {
      if (Buffer.byteLength(stderr) < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString()
      }
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}` })
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      finish({
        exitCode: typeof code === 'number' ? code : 128,
        stdout,
        stderr: signal ? `${stderr}\nterminated by ${signal}` : stderr,
      })
    })
  })

  const finishedAt = now()
  const stdout = bounded(result.stdout)
  const stderr = bounded(result.stderr)
  return {
    command: [command, ...args],
    startedAt,
    finishedAt,
    durationMs: Date.now() - started,
    exitCode: result.exitCode,
    stdout,
    stderr,
    parsedJson: parseJson(stdout),
  }
}

async function ensureRoot() {
  await fs.mkdir(path.join(SANDBOX_ROOT, 'repos'), { recursive: true })
  await fs.mkdir(path.join(SANDBOX_ROOT, 'jobs'), { recursive: true })
}

function validateJob(job) {
  const requiredStrings = ['requestId', 'projectId', 'repository', 'outcome', 'idempotencyKey']
  for (const key of requiredStrings) {
    if (!job || typeof job[key] !== 'string' || !job[key].trim()) {
      throw new Error(`${key} is required`)
    }
  }
  if (!REPOSITORY_RE.test(job.repository)) {
    throw new Error('repository must be owner/name')
  }
  if (!['green', 'yellow', 'red'].includes(job.risk)) {
    throw new Error('risk must be green, yellow, or red')
  }
  if (job.risk === 'red') {
    throw new Error('red-risk coding jobs require a higher-level human approval and are not prepared here')
  }
  if (!Array.isArray(job.constraints) || !Array.isArray(job.proof)) {
    throw new Error('constraints and proof must be arrays')
  }
  const budget = job.budget || {}
  if (!Number.isFinite(budget.runtimeMinutes) || budget.runtimeMinutes <= 0) {
    throw new Error('budget.runtimeMinutes must be positive')
  }
  if (!Number.isFinite(budget.maxWorkers) || budget.maxWorkers < 1 || budget.maxWorkers > 8) {
    throw new Error('budget.maxWorkers must be between 1 and 8')
  }
  if (!Number.isFinite(budget.maxRetries) || budget.maxRetries < 0 || budget.maxRetries > 10) {
    throw new Error('budget.maxRetries must be between 0 and 10')
  }
}

function jobRecordPath(idempotencyKey) {
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex')
  return path.join(SANDBOX_ROOT, 'jobs', `${digest}.json`)
}

async function readExisting(job) {
  try {
    const parsed = JSON.parse(await fs.readFile(jobRecordPath(job.idempotencyKey), 'utf8'))
    if (parsed.repository !== job.repository || parsed.projectId !== job.projectId) {
      throw new Error('Idempotency key is already bound to a different job')
    }
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function persistReceipt(job, receipt) {
  const file = jobRecordPath(job.idempotencyKey)
  const temp = `${file}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(receipt, null, 2), { mode: 0o600 })
  await fs.rename(temp, file)
}

async function probeCapabilities() {
  const receipts = [
    await run(GIT_BIN, ['--version']),
    await run(ORCA_BIN, ['agent-context', '--json']),
    await run(ORCA_BIN, ['status', '--json']),
  ]
  const failures = receipts
    .filter((receipt) => receipt.exitCode !== 0)
    .map((receipt) => `${receipt.command.slice(0, 2).join(' ')} exited ${receipt.exitCode}`)
  const versionReceipt = await run(ORCA_BIN, ['--version'])
  if (versionReceipt.exitCode === 0) {
    receipts.unshift(versionReceipt)
  }
  return {
    ok: failures.length === 0,
    version: versionReceipt.exitCode === 0 ? versionReceipt.stdout.trim() : undefined,
    receipts,
    failures,
  }
}

async function prepareJob(job) {
  validateJob(job)
  await ensureRoot()
  const existing = await readExisting(job)
  if (existing && ['ready', 'running', 'testing', 'reviewing', 'complete'].includes(existing.state)) {
    return existing
  }

  const receipt = {
    requestId: job.requestId,
    projectId: job.projectId,
    repository: job.repository,
    state: 'validating',
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
    adapterVersion: 'terabithia-orca-v1',
    commandReceipts: existing?.commandReceipts || [],
    failures: [],
  }

  const [owner, repoName] = job.repository.split('/')
  const repoDir = path.join(SANDBOX_ROOT, 'repos', `${safeSegment(owner, 'owner')}__${safeSegment(repoName, 'repo')}`)
  assertWithinSandbox(repoDir)

  try {
    receipt.state = 'probing'
    receipt.updatedAt = now()
    const probe = await probeCapabilities()
    receipt.commandReceipts.push(...probe.receipts)
    if (!probe.ok) {
      receipt.state = 'blocked'
      receipt.failures.push(...probe.failures)
      receipt.updatedAt = now()
      await persistReceipt(job, receipt)
      return receipt
    }

    try {
      await fs.access(path.join(repoDir, '.git'))
      const fetched = await run(GIT_BIN, ['fetch', '--prune', 'origin'], { cwd: repoDir })
      receipt.commandReceipts.push(fetched)
      if (fetched.exitCode !== 0) {
        throw new Error('git fetch failed')
      }
    } catch (error) {
      if (error?.message === 'git fetch failed') {
        throw error
      }
      await fs.rm(repoDir, { recursive: true, force: true })
      const cloned = await run(GIT_BIN, [
        'clone',
        '--filter=blob:none',
        '--no-tags',
        `https://github.com/${job.repository}.git`,
        repoDir,
      ])
      receipt.commandReceipts.push(cloned)
      if (cloned.exitCode !== 0) {
        throw new Error('git clone failed')
      }
    }

    const repoAdd = await run(ORCA_BIN, ['repo', 'add', '--path', repoDir, '--json'])
    receipt.commandReceipts.push(repoAdd)
    if (repoAdd.exitCode !== 0 && !/already|exists|registered/i.test(`${repoAdd.stdout}\n${repoAdd.stderr}`)) {
      throw new Error('orca repo add failed')
    }

    const suffix = crypto.createHash('sha256').update(job.idempotencyKey).digest('hex').slice(0, 8)
    const worktreeName = `pauli-${safeSegment(job.projectId, 'project')}-${suffix}`
    const created = await run(ORCA_BIN, [
      'worktree',
      'create',
      '--repo',
      `path:${repoDir}`,
      '--name',
      worktreeName,
      '--no-parent',
      '--setup',
      'skip',
      '--json',
    ])
    receipt.commandReceipts.push(created)
    if (created.exitCode !== 0 && !/already|exists/i.test(`${created.stdout}\n${created.stderr}`)) {
      throw new Error('orca worktree create failed')
    }

    receipt.state = 'ready'
    receipt.updatedAt = now()
    await persistReceipt(job, receipt)
    return receipt
  } catch (error) {
    receipt.state = 'failed'
    receipt.updatedAt = now()
    receipt.failures.push(error instanceof Error ? error.message : String(error))
    await persistReceipt(job, receipt)
    return receipt
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      status: 'ok',
      service: 'pauli-orca-factory',
      adapterVersion: 'terabithia-orca-v1',
      sandboxRoot: SANDBOX_ROOT,
      tokenConfigured: Boolean(TOKEN),
    })
  }
  if (!authorized(req)) {
    return json(res, 401, { error: 'Unauthorized' })
  }

  try {
    if (req.method === 'GET' && url.pathname === '/v1/capabilities') {
      return json(res, 200, await probeCapabilities())
    }
    if (req.method === 'POST' && url.pathname === '/v1/jobs/prepare') {
      return json(res, 200, await prepareJob(await readJson(req)))
    }
    return json(res, 404, { error: 'NotFound' })
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : 'BadRequest' })
  }
})

server.listen(PORT, HOST, async () => {
  await ensureRoot()
  process.stdout.write(`Pauli Orca factory listening on http://${HOST}:${PORT}\n`)
})
