import { WebSocketServer } from "ws";

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT });

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[bridge] Client connected (${clients.size} total)`);

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    // Log gesture events
    if (msg.type !== "NONE") {
      console.log(`[gesture] ${msg.type} at (${msg.x.toFixed(3)}, ${msg.y.toFixed(3)}) pinch=${msg.pinch.toFixed(3)}`);
    }

    // Broadcast to all other clients (e.g., Playwright MCP, DevTools, OSC bridge)
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(data.toString());
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[bridge] Client disconnected (${clients.size} remaining)`);
  });
});

console.log(`[bridge] Gesture bridge running on ws://localhost:${PORT}`);
console.log("[bridge] Waiting for connections from browser + external tools...");
