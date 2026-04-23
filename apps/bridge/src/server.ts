import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";
import { createBridgeApp } from "./app";
import { bridgeLog } from "./lib/sanitizeLog";
import { createBridgeRuntime } from "./runtime";

const runtime = await createBridgeRuntime();
const app = createBridgeApp(runtime);
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({ type: "events.snapshot", payload: runtime.state.events.slice(-50) }),
  );
  const unsubscribe = runtime.subscribeEvents((event) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
  });
  socket.on("close", unsubscribe);
});

const server = serve({ fetch: app.fetch, port: runtime.env.port }, () => {
  bridgeLog(`Bridge listening on http://localhost:${runtime.env.port}`);
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws/events") {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    return;
  }
  socket.destroy();
});
