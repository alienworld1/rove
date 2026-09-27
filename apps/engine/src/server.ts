import { createServer } from "node:http";
import { readBaseConfig } from "@rove/config";
import { readinessSchema } from "@rove/contracts";

const config = readBaseConfig();

const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end();
    return;
  }

  const body = readinessSchema.parse({
    status: "ready",
    engineReachable: true,
    checkedAt: new Date().toISOString(),
    dependencies: { web: "not checked", engine: "ready" },
  });
  response.writeHead(200, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
});

server.listen(config.ENGINE_PORT, config.ENGINE_HOST);
