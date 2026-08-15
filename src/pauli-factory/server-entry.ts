import { createFactoryServer } from "./server.js";

const host = process.env.PAULI_FACTORY_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PAULI_FACTORY_PORT || "4810", 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PAULI_FACTORY_PORT must be a valid TCP port.");
}

const server = createFactoryServer();

server.listen(port, host, () => {
  process.stdout.write(
    JSON.stringify({
      event: "factory.server.started",
      host,
      port,
      adapterVersion: "terabithia-orca-v1",
      timestamp: new Date().toISOString(),
    }) + "\n",
  );
});

const shutdown = (signal: string) => {
  server.close(() => {
    process.stdout.write(
      JSON.stringify({
        event: "factory.server.stopped",
        signal,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
