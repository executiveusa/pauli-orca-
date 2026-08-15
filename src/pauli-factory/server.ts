import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { FactoryJobContract } from "./contracts.js";
import { OrcaCliAdapter } from "./orca-cli-adapter.js";
import { PauliFactorySupervisor } from "./supervisor.js";

export interface FactoryServerOptions {
  token?: string;
  supervisor?: PauliFactorySupervisor;
  maxBodyBytes?: number;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBodyBytes) {
        reject(new Error("Request body exceeds factory limit."));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8").trim();
        resolve(body ? (JSON.parse(body) as unknown) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

export function createFactoryServer(options: FactoryServerOptions = {}): http.Server {
  const token = options.token ?? process.env.PAULI_FACTORY_TOKEN;
  if (!token?.trim()) {
    throw new Error("PAULI_FACTORY_TOKEN is required; factory server fails closed.");
  }

  const supervisor = options.supervisor ?? new PauliFactorySupervisor(new OrcaCliAdapter());
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const method = req.method || "GET";

    if (url.pathname === "/health" && method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        service: "pauli-orca-factory-adapter",
        adapterVersion: "terabithia-orca-v1",
      });
      return;
    }

    const authorization = req.headers.authorization || "";
    if (authorization !== `Bearer ${token}`) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    if (url.pathname === "/v1/capabilities" && method === "GET") {
      const probe = await new OrcaCliAdapter().probeCapabilities();
      sendJson(res, probe.ok ? 200 : 503, probe);
      return;
    }

    if (url.pathname === "/v1/jobs/prepare" && method === "POST") {
      try {
        const body = (await readJsonBody(req, maxBodyBytes)) as FactoryJobContract;
        const receipt = await supervisor.prepare(body);
        const statusCode = receipt.state === "ready" ? 200 : receipt.state === "blocked" ? 503 : 400;
        sendJson(res, statusCode, receipt);
      } catch (error) {
        sendJson(res, 400, {
          error: "BadRequest",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    sendJson(res, 404, { error: "NotFound" });
  });
}
