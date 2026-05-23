import { createServer, startCronSync } from "./server.js";
import { config } from "./config.js";

const app = createServer();

app.listen(config.port, () => {
  console.log(`[megabrain] Server running on port ${config.port}`);
  console.log(`[megabrain] MCP endpoint: http://localhost:${config.port}/mcp/sse`);
  console.log(`[megabrain] Webhook: http://localhost:${config.port}/webhook/github`);
});

// Start backup cron sync
startCronSync();
