/**
 * Wires the batch-render service (see ../scripts/render-core.mjs) directly
 * into Storybook's own dev server as a Vite plugin — so the "Generate"
 * button in a story (src/dev-tools/RenderQueuePanel.tsx) always has
 * somewhere to POST to, with nothing separate to remember to start. Same
 * `/render` endpoint, just same-origin now instead of its own port.
 */
import { renderBatch } from "../scripts/render-core.mjs";

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

export const renderMiddlewarePlugin = () => ({
  name: "leaderboard-render-middleware",
  configureServer(server) {
    server.middlewares.use("/render", async (req, res, next) => {
      if (req.method !== "POST") return next();

      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "invalid JSON body" }));
        return;
      }

      const { entry, compositionId, jobs } = body;
      if (!compositionId || !Array.isArray(jobs) || jobs.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "compositionId and a non-empty jobs[] are required" }));
        return;
      }

      try {
        const result = await renderBatch({ projectRoot: process.cwd(), entry, compositionId, jobs });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("Render batch failed:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    });
  },
});
