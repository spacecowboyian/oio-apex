#!/usr/bin/env node
/**
 * Standalone version of the batch-render service, for contexts outside
 * Storybook (a future CLI batch job, CI, etc). While developing in
 * Storybook, this runs automatically as part of its own dev server — see
 * `.storybook/render-middleware.mjs` — so you normally don't need to start
 * this separately. Shares its actual render logic with that middleware via
 * `render-core.mjs`.
 */
import http from "node:http";
import { renderBatch } from "./render-core.mjs";

const PORT = process.env.RENDER_SERVER_PORT ? Number(process.env.RENDER_SERVER_PORT) : 3939;
const PROJECT_ROOT = process.cwd();

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/render") {
    sendJson(res, 404, { error: "not found — POST /render" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }

  const { entry, compositionId, jobs } = body;
  if (!compositionId || !Array.isArray(jobs) || jobs.length === 0) {
    sendJson(res, 400, { error: "compositionId and a non-empty jobs[] are required" });
    return;
  }

  try {
    const result = await renderBatch({ projectRoot: PROJECT_ROOT, entry, compositionId, jobs });
    sendJson(res, 200, result);
  } catch (err) {
    console.error("Render batch failed:", err);
    sendJson(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`Render server listening on http://localhost:${PORT}`);
});
