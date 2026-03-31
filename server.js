const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createLinearClient } = require("./lib/linearClient");
const { createDashboardStore } = require("./lib/dashboardStore");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 300000);
const PUBLIC_DIR = path.join(__dirname, "public");

const linearClient = createLinearClient({
  apiKey: process.env.LINEAR_API_KEY || "",
});

const store = createDashboardStore({ linearClient });
const sseClients = new Set();

function broadcast(event, payload) {
  const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    client.write(serialized);
  }
}

store.onUpdate((snapshot) => broadcast("dashboard", snapshot));
store.onError((error) =>
  broadcast("sync-error", {
    message: error.message,
    at: new Date().toISOString(),
  }),
);

async function startSyncLoop() {
  try {
    await store.refresh("startup");
  } catch (error) {
    console.error(`Initial sync skipped: ${error.message}`);
  }

  setInterval(() => {
    store.refresh("polling").catch(() => {});
  }, SYNC_INTERVAL_MS);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(process.env.LINEAR_API_KEY),
        syncIntervalMs: SYNC_INTERVAL_MS,
      });
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      return sendJson(res, 200, store.getSnapshot());
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      res.write("\n");
      sseClients.add(res);
      res.write(
        `event: dashboard\ndata: ${JSON.stringify(store.getSnapshot())}\n\n`,
      );
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/linear") {
      const rawBody = await readRawBody(req);
      let payload = {};

      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      }

      if (process.env.LINEAR_WEBHOOK_SECRET) {
        const providedSignature = req.headers["linear-signature"];

        if (
          !verifyLinearSignature({
            secret: process.env.LINEAR_WEBHOOK_SECRET,
            rawBody,
            providedSignature,
          })
        ) {
          return sendJson(res, 401, { ok: false, error: "Invalid signature." });
        }

        if (
          Math.abs(Date.now() - Number(payload.webhookTimestamp || 0)) >
          60 * 1000
        ) {
          return sendJson(res, 401, {
            ok: false,
            error: "Webhook timestamp is too old.",
          });
        }
      }

      sendJson(res, 200, { ok: true });
      store.refresh("webhook", payload).catch(() => {});
      return;
    }

    if (req.method === "GET") {
      return serveStatic(req, res, url.pathname);
    }

    sendJson(res, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  startSyncLoop().catch((error) => {
    console.error(`Sync loop failed: ${error.message}`);
  });
  console.log(`Linear room dashboard listening on http://localhost:${PORT}`);
});

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendJson(res, 403, { ok: false, error: "Forbidden." });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { ok: false, error: "Not found." });
  }

  res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function verifyLinearSignature({ secret, rawBody, providedSignature }) {
  if (typeof providedSignature !== "string") {
    return false;
  }

  const providedBuffer = Buffer.from(providedSignature, "hex");
  const computedBuffer = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  if (providedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, computedBuffer);
}

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
